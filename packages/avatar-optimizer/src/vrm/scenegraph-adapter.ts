import { GLTFScenegraph, type GLTFWithBuffers } from '@loaders.gl/gltf'
import type {
  AtlasBuildResult,
  AtlasMaterialDescriptor,
  AtlasTextureDescriptor,
  MaterialPlacement,
  TextureSlot,
} from '@xrift/avatar-optimizer-texture-atlas'

interface MaterialTextureReference {
  textureIndex: number
  texCoord?: number
}

export interface MaterialTextureSlots {
  baseColor?: MaterialTextureReference
  metallicRoughness?: MaterialTextureReference
  normal?: MaterialTextureReference
  occlusion?: MaterialTextureReference
  emissive?: MaterialTextureReference
}

export interface ScenegraphMaterialInfo {
  id: number
  name?: string
  textures: MaterialTextureSlots
}

export interface ScenegraphTextureInfo {
  id: number
  name?: string
  imageIndex: number | null
  samplerIndex: number | null
  source?: {
    bufferView?: number
    uri?: string
    mimeType?: string
  }
}

export interface ScenegraphPrimitiveInfo {
  id: number
  materialId: number | null
  attributes: {
    texCoord0?: number
    texCoord1?: number
  }
}

export interface ScenegraphMeshInfo {
  id: number
  name?: string
  primitives: ScenegraphPrimitiveInfo[]
}

export interface ScenegraphDigest {
  materials: ScenegraphMaterialInfo[]
  textures: ScenegraphTextureInfo[]
  meshes: ScenegraphMeshInfo[]
}

type DecodedTextureImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

interface PendingAtlasTexture {
  slot: TextureSlot
  data: Uint8Array
  mimeType: string
}

interface PendingMaterialAssignment {
  materialId: number
  slot: TextureSlot
  texCoord?: number
}

const MATERIAL_TEXTURE_SLOTS: Array<{
  slot: TextureSlot
  pick: (slots: MaterialTextureSlots) => MaterialTextureReference | undefined
}> = [
  { slot: 'baseColor', pick: (slots) => slots.baseColor },
  { slot: 'metallicRoughness', pick: (slots) => slots.metallicRoughness },
  { slot: 'normal', pick: (slots) => slots.normal },
  { slot: 'emissive', pick: (slots) => slots.emissive },
  { slot: 'occlusion', pick: (slots) => slots.occlusion },
]

const PRIMARY_SLOT_PRIORITY: TextureSlot[] = [
  'baseColor',
  'metallicRoughness',
  'normal',
  'emissive',
  'occlusion',
]

export class ScenegraphAdapter {
  private readonly scenegraph: GLTFScenegraph
  private digestCache?: ScenegraphDigest
  private readonly materialDescriptorMap = new Map<string, number>()
  private readonly textureDescriptorMap = new Map<
    string,
    { textureIndex: number; texCoord?: number }
  >()
  private readonly materialDescriptors = new Map<string, AtlasMaterialDescriptor>()
  private readonly pendingAtlasTextures = new Map<TextureSlot, PendingAtlasTexture>()
  private readonly pendingAssignments: Map<string, PendingMaterialAssignment> = new Map()
  private readonly texturesMarkedForRemoval = new Set<number>()
  private pendingPlacements: MaterialPlacement[] = []

  private constructor(scenegraph: GLTFScenegraph) {
    this.scenegraph = scenegraph
  }

  static from(gltf: GLTFWithBuffers): ScenegraphAdapter {
    return new ScenegraphAdapter(new GLTFScenegraph(gltf))
  }

  createDigest(): ScenegraphDigest {
    if (!this.digestCache) {
      this.digestCache = {
        materials: this.collectMaterials(),
        textures: this.collectTextures(),
        meshes: this.collectMeshes(),
      }
    }
    return this.digestCache
  }

  async createAtlasMaterialDescriptors(): Promise<AtlasMaterialDescriptor[]> {
    const digest = this.createDigest()
    this.materialDescriptorMap.clear()
    this.textureDescriptorMap.clear()
    this.materialDescriptors.clear()

    const textureMap = new Map(digest.textures.map((texture) => [texture.id, texture]))
    const decodeCache = new Map<number, Promise<DecodedTextureImage>>()
    const descriptors: AtlasMaterialDescriptor[] = []

    for (const material of digest.materials) {
      const textureDescriptors: AtlasTextureDescriptor[] = []
      const descriptorId = buildMaterialDescriptorId(material.id, material.name)

      for (const entry of MATERIAL_TEXTURE_SLOTS) {
        const reference = entry.pick(material.textures)
        if (!reference) {
          continue
        }

        const textureInfo = textureMap.get(reference.textureIndex)
        if (!textureInfo) {
          continue
        }

        const descriptor = await this.buildTextureDescriptor(
          textureInfo,
          entry.slot,
          decodeCache,
        )
        if (descriptor) {
          textureDescriptors.push(descriptor)
          this.textureDescriptorMap.set(descriptor.id, {
            textureIndex: textureInfo.id,
            texCoord: reference.texCoord,
          })
        }
      }

      if (!textureDescriptors.length) {
        continue
      }

      const descriptor: AtlasMaterialDescriptor = {
        id: descriptorId,
        textures: textureDescriptors,
        primaryTextureIndex: selectPrimaryTextureIndex(textureDescriptors),
      }

      descriptors.push(descriptor)
      this.materialDescriptorMap.set(descriptorId, material.id)
      this.materialDescriptors.set(descriptorId, descriptor)
    }

    return descriptors
  }

  applyAtlasResult(result: AtlasBuildResult, options?: { mimeType?: string }): void {
    if (!this.materialDescriptors.size) {
      throw new Error('No material descriptors registered. Call createAtlasMaterialDescriptors() first.')
    }

    const mimeType = options?.mimeType ?? 'image/png'
    const slotsWithAtlases = new Set(result.atlases.map((atlas) => atlas.slot))

    for (const atlas of result.atlases) {
      this.pendingAtlasTextures.set(atlas.slot, {
        slot: atlas.slot,
        data: atlas.atlasImage,
        mimeType,
      })
    }

    for (const [descriptorId, descriptor] of this.materialDescriptors) {
      const materialId = this.materialDescriptorMap.get(descriptorId)
      if (materialId === undefined) {
        continue
      }

      for (const texture of descriptor.textures) {
        if (!slotsWithAtlases.has(texture.slot)) {
          continue
        }

        const binding = this.textureDescriptorMap.get(texture.id)
        if (!binding) {
          continue
        }

        const assignmentKey = `${materialId}:${texture.slot}`
        if (!this.pendingAssignments.has(assignmentKey)) {
          this.pendingAssignments.set(assignmentKey, {
            materialId,
            slot: texture.slot,
            texCoord: binding.texCoord,
          })
        }

        this.texturesMarkedForRemoval.add(binding.textureIndex)
      }
    }

    this.pendingPlacements = result.placements
  }

  flush(): void {
    const slotTextureIndexMap = this.commitPendingAtlasTextures()
    this.commitMaterialAssignments(slotTextureIndexMap)
    this.removeMarkedTextures()
    this.pendingPlacements = []
  }

  unwrap(): GLTFScenegraph {
    return this.scenegraph
  }

  private collectMaterials(): ScenegraphMaterialInfo[] {
    const materials = this.scenegraph.json.materials ?? []
    return materials.map((material, index) => ({
      id: index,
      name: material.name,
      textures: {
        baseColor: toTextureReference(material.pbrMetallicRoughness?.baseColorTexture),
        metallicRoughness: toTextureReference(
          material.pbrMetallicRoughness?.metallicRoughnessTexture,
        ),
        normal: toTextureReference(material.normalTexture),
        occlusion: toTextureReference(material.occlusionTexture),
        emissive: toTextureReference(material.emissiveTexture),
      },
    }))
  }

  private collectTextures(): ScenegraphTextureInfo[] {
    const textures = this.scenegraph.json.textures ?? []
    const images = this.scenegraph.json.images ?? []

    return textures.map((texture, index) => {
      const imageIndex = texture.source ?? null
      const image = typeof imageIndex === 'number' ? images[imageIndex] : undefined
      return {
        id: index,
        name: texture.name,
        imageIndex,
        samplerIndex: texture.sampler ?? null,
        source: image
          ? {
              bufferView: image.bufferView,
              uri: image.uri,
              mimeType: image.mimeType,
            }
          : undefined,
      }
    })
  }

  private collectMeshes(): ScenegraphMeshInfo[] {
    const meshes = this.scenegraph.json.meshes ?? []
    let primitiveCursor = 0

    return meshes.map((mesh, meshIndex) => {
      const primitives =
        mesh.primitives?.map((primitive) => ({
          id: primitiveCursor++,
          materialId: typeof primitive.material === 'number' ? primitive.material : null,
          attributes: {
            texCoord0: primitive.attributes?.TEXCOORD_0 ?? undefined,
            texCoord1: primitive.attributes?.TEXCOORD_1 ?? undefined,
          },
        })) ?? []

      return {
        id: meshIndex,
        name: mesh.name,
        primitives,
      }
    })
  }

  private async buildTextureDescriptor(
    textureInfo: ScenegraphTextureInfo,
    slot: TextureSlot,
    decodeCache: Map<number, Promise<DecodedTextureImage>>,
  ): Promise<AtlasTextureDescriptor | null> {
    if (textureInfo.imageIndex == null) {
      return null
    }

    const decodedImagePromise = this.getOrDecodeTextureImage(
      textureInfo.id,
      textureInfo.imageIndex,
      decodeCache,
    )
    const decoded = await decodedImagePromise

    return {
      id: `texture:${textureInfo.id}:${slot}`,
      slot,
      width: decoded.width,
      height: decoded.height,
      readImageData: () => decodedImagePromise.then((image) => image.data),
    }
  }

  private getOrDecodeTextureImage(
    textureId: number,
    imageIndex: number,
    decodeCache: Map<number, Promise<DecodedTextureImage>>,
  ): Promise<DecodedTextureImage> {
    if (!decodeCache.has(textureId)) {
      decodeCache.set(textureId, this.decodeImageFromScenegraph(imageIndex))
    }
    return decodeCache.get(textureId) as Promise<DecodedTextureImage>
  }

  private async decodeImageFromScenegraph(imageIndex: number): Promise<DecodedTextureImage> {
    const binary = this.getImageBinary(imageIndex)
    if (!binary) {
      throw new Error(`Image ${imageIndex} has no binary payload`)
    }

    const jimp = await loadJimpModule()
    const image = await jimp.read(Buffer.from(binary))
    const data = ensureUint8ClampedArray(image.bitmap.data)

    return {
      width: image.bitmap.width,
      height: image.bitmap.height,
      data,
    }
  }

  private getImageBinary(imageIndex: number): Uint8Array | null {
    const image = this.scenegraph.json.images?.[imageIndex]
    if (!image) {
      return null
    }

    if (typeof image.bufferView === 'number') {
      return this.scenegraph.getTypedArrayForBufferView(image.bufferView)
    }

    if (typeof image.uri === 'string') {
      return decodeDataUri(image.uri)
    }

    return null
  }

  private commitPendingAtlasTextures(): Map<TextureSlot, number> {
    const slotTextureIndexMap = new Map<TextureSlot, number>()
    for (const pending of this.pendingAtlasTextures.values()) {
      const imageIndex = this.scenegraph.addImage(pending.data, pending.mimeType)
      const textureIndex = this.scenegraph.addTexture({ imageIndex })
      slotTextureIndexMap.set(pending.slot, textureIndex)
    }
    this.pendingAtlasTextures.clear()
    return slotTextureIndexMap
  }

  private commitMaterialAssignments(slotTextureIndexMap: Map<TextureSlot, number>): void {
    const materials = this.scenegraph.json.materials ?? []

    for (const assignment of this.pendingAssignments.values()) {
      const textureIndex = slotTextureIndexMap.get(assignment.slot)
      if (textureIndex === undefined) {
        continue
      }

      const material = materials[assignment.materialId]
      if (!material) {
        continue
      }

      this.updateMaterialTexture(material, assignment.slot, textureIndex, assignment.texCoord)
    }

    this.pendingAssignments.clear()
  }

  private removeMarkedTextures(): void {
    if (!this.texturesMarkedForRemoval.size) {
      return
    }

    const usage = this.buildTextureUsageMap()
    const targets = [...this.texturesMarkedForRemoval].sort((a, b) => b - a)
    const textures = this.scenegraph.json.textures ?? []

    for (const textureIndex of targets) {
      if (textureIndex < 0 || textureIndex >= textures.length) {
        continue
      }
      const count = usage.get(textureIndex) ?? 0
      if (count > 0) {
        continue
      }
      this.removeTextureAtIndex(textureIndex)
    }

    this.texturesMarkedForRemoval.clear()
  }

  private buildTextureUsageMap(): Map<number, number> {
    const usage = new Map<number, number>()
    const materials = this.scenegraph.json.materials ?? []

    const tally = (ref?: { index?: number }) => {
      if (ref?.index === undefined) return
      usage.set(ref.index, (usage.get(ref.index) ?? 0) + 1)
    }

    for (const material of materials) {
      tally(material.pbrMetallicRoughness?.baseColorTexture)
      tally(material.pbrMetallicRoughness?.metallicRoughnessTexture)
      tally(material.normalTexture)
      tally(material.emissiveTexture)
      tally(material.occlusionTexture)
    }

    return usage
  }

  private removeTextureAtIndex(textureIndex: number): void {
    const textures = this.scenegraph.json.textures
    if (!textures || textureIndex < 0 || textureIndex >= textures.length) {
      return
    }

    const [removed] = textures.splice(textureIndex, 1)
    this.adjustMaterialTextureIndices(textureIndex)

    if (typeof removed?.source === 'number') {
      this.removeImageAtIndex(removed.source)
    }
  }

  private adjustMaterialTextureIndices(removedIndex: number): void {
    const materials = this.scenegraph.json.materials ?? []

    const adjust = (ref?: { index?: number }) => {
      if (!ref || ref.index === undefined) {
        return
      }
      if (ref.index === removedIndex) {
        delete ref.index
      } else if (ref.index > removedIndex) {
        ref.index -= 1
      }
    }

    for (const material of materials) {
      adjust(material.pbrMetallicRoughness?.baseColorTexture)
      adjust(material.pbrMetallicRoughness?.metallicRoughnessTexture)
      adjust(material.normalTexture)
      adjust(material.emissiveTexture)
      adjust(material.occlusionTexture)
    }
  }

  private removeImageAtIndex(imageIndex: number): void {
    const images = this.scenegraph.json.images
    if (!images || imageIndex < 0 || imageIndex >= images.length) {
      return
    }

    images.splice(imageIndex, 1)

    const textures = this.scenegraph.json.textures ?? []
    textures.forEach((texture) => {
      if (texture.source === undefined) {
        return
      }
      if (texture.source === imageIndex) {
        delete texture.source
      } else if (texture.source > imageIndex) {
        texture.source -= 1
      }
    })
  }

  private updateMaterialTexture(
    material: any,
    slot: TextureSlot,
    textureIndex: number,
    texCoord?: number,
  ): void {
    switch (slot) {
      case 'baseColor': {
        material.pbrMetallicRoughness = material.pbrMetallicRoughness ?? {}
        const existing = material.pbrMetallicRoughness.baseColorTexture ?? {}
        material.pbrMetallicRoughness.baseColorTexture = {
          ...existing,
          index: textureIndex,
          texCoord: texCoord ?? existing.texCoord,
        }
        break
      }
      case 'metallicRoughness': {
        material.pbrMetallicRoughness = material.pbrMetallicRoughness ?? {}
        const existing = material.pbrMetallicRoughness.metallicRoughnessTexture ?? {}
        material.pbrMetallicRoughness.metallicRoughnessTexture = {
          ...existing,
          index: textureIndex,
          texCoord: texCoord ?? existing.texCoord,
        }
        break
      }
      case 'normal': {
        const existing = material.normalTexture ?? {}
        material.normalTexture = {
          ...existing,
          index: textureIndex,
          texCoord: texCoord ?? existing.texCoord,
        }
        break
      }
      case 'emissive': {
        const existing = material.emissiveTexture ?? {}
        material.emissiveTexture = {
          ...existing,
          index: textureIndex,
          texCoord: texCoord ?? existing.texCoord,
        }
        break
      }
      case 'occlusion': {
        const existing = material.occlusionTexture ?? {}
        material.occlusionTexture = {
          ...existing,
          index: textureIndex,
          texCoord: texCoord ?? existing.texCoord,
        }
        break
      }
      default:
        break
    }
  }
}

function selectPrimaryTextureIndex(textures: AtlasTextureDescriptor[]): number {
  for (const slot of PRIMARY_SLOT_PRIORITY) {
    const index = textures.findIndex((texture) => texture.slot === slot)
    if (index >= 0) {
      return index
    }
  }
  return 0
}

function decodeDataUri(uri: string): Uint8Array | null {
  const match = uri.match(/^data:(.*?)(;base64)?,(.*)$/)
  if (!match) {
    return null
  }

  const isBase64 = Boolean(match[2])
  const dataPart = match[3]

  if (isBase64) {
    return decodeBase64(dataPart)
  }

  const decoded = decodeURIComponent(dataPart)
  const encoder = new TextEncoder()
  return encoder.encode(decoded)
}

function ensureUint8ClampedArray(data: Uint8Array | Uint8ClampedArray): Uint8ClampedArray {
  if (data instanceof Uint8ClampedArray) {
    return data
  }
  const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  return new Uint8ClampedArray(slice)
}

function decodeBase64(data: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(data, 'base64'))
  }

  throw new Error('No base64 decoder available in this environment')
}

function toTextureReference(
  textureSlot: { index?: number; texCoord?: number } | undefined,
): MaterialTextureReference | undefined {
  if (textureSlot?.index === undefined) {
    return undefined
  }
  return {
    textureIndex: textureSlot.index,
    texCoord: textureSlot.texCoord,
  }
}

function buildMaterialDescriptorId(materialId: number, materialName?: string): string {
  if (materialName) {
    return `material:${materialId}:${materialName}`
  }
  return `material:${materialId}`
}

type JimpConstructor = typeof import('jimp')['default']
let jimpModulePromise: Promise<JimpConstructor> | null = null

async function loadJimpModule(): Promise<JimpConstructor> {
  if (!jimpModulePromise) {
    jimpModulePromise = import('jimp').then((mod: any) => {
      if (typeof mod === 'function') {
        return mod
      }
      if (typeof mod?.default === 'function') {
        return mod.default
      }
      if (typeof mod?.Jimp === 'function') {
        return mod.Jimp
      }
      throw new Error('Failed to load jimp module')
    })
  }
  return jimpModulePromise
}
