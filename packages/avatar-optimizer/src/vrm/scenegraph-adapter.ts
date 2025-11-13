import { GLTFScenegraph, type GLTFWithBuffers } from '@loaders.gl/gltf'
import type {
  AtlasBuildResult,
  AtlasMaterialDescriptor,
  AtlasTextureDescriptor,
  MaterialPlacement,
  TextureSlot,
} from '@xrift/avatar-optimizer-texture-atlas'
import { err, ok, type Result } from 'neverthrow'

import type { OptimizationError } from '../types'

interface MaterialTextureReference {
  textureIndex: number
  texCoord?: number
}

export interface MaterialTextureSlots {
  main?: MaterialTextureReference
  shadeMultiply?: MaterialTextureReference
  normal?: MaterialTextureReference
  emission?: MaterialTextureReference
  rimMultiply?: MaterialTextureReference
  outlineWidth?: MaterialTextureReference
  matcap?: MaterialTextureReference
  uvAnimationMask?: MaterialTextureReference
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

export interface PendingMaterialPlacement {
  materialIndex: number
  texCoord: number
  uvTransform: MaterialPlacement['uvTransform']
}

interface VRM0MaterialProperty {
  name?: string
  shader?: string
  textureProperties?: Record<string, number>
}

type DecodedTextureImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

interface MaterialTextureDependencyGraph {
  textures: Set<number>
  images: Set<number>
}

const SHADE_SLOT: TextureSlot = 'custom:shadeMultiply'
const RIM_SLOT: TextureSlot = 'custom:rimMultiply'
const OUTLINE_SLOT: TextureSlot = 'custom:outlineWidth'
const MATCAP_SLOT: TextureSlot = 'custom:matcap'
const UV_MASK_SLOT: TextureSlot = 'custom:uvAnimationMask'
const VRM0_TEXTURE_PROPERTY_MAP: Record<string, string> = {
  baseColor: '_MainTex',
  normal: '_BumpMap',
  emissive: '_EmissionMap',
  [SHADE_SLOT]: '_ShadeTexture',
  [RIM_SLOT]: '_RimTexture',
  [OUTLINE_SLOT]: '_OutlineWidthTexture',
  [UV_MASK_SLOT]: '_UvAnimMaskTexture',
}
const VRM10_TEXTURE_FIELD_MAP: Record<string, string> = {
  [SHADE_SLOT]: 'shadeMultiplyTexture',
  [RIM_SLOT]: 'rimMultiplyTexture',
  [OUTLINE_SLOT]: 'outlineWidthMultiplyTexture',
  [MATCAP_SLOT]: 'matcapTexture',
  [UV_MASK_SLOT]: 'uvAnimationMaskTexture',
}

const MATERIAL_TEXTURE_SLOTS: Array<{
  slot: TextureSlot
  pick: (slots: MaterialTextureSlots) => MaterialTextureReference | undefined
}> = [
  { slot: 'baseColor', pick: (slots) => slots.main },
  { slot: 'normal', pick: (slots) => slots.normal },
  { slot: 'emissive', pick: (slots) => slots.emission },
  { slot: SHADE_SLOT, pick: (slots) => slots.shadeMultiply },
  { slot: RIM_SLOT, pick: (slots) => slots.rimMultiply },
  { slot: OUTLINE_SLOT, pick: (slots) => slots.outlineWidth },
  { slot: MATCAP_SLOT, pick: (slots) => slots.matcap },
  { slot: UV_MASK_SLOT, pick: (slots) => slots.uvAnimationMask },
]

const PRIMARY_SLOT_PRIORITY: TextureSlot[] = [
  'baseColor',
  SHADE_SLOT,
  'normal',
  'emissive',
  RIM_SLOT,
  OUTLINE_SLOT,
  UV_MASK_SLOT,
  MATCAP_SLOT,
]

export type VRMMajorVersion = '0.x' | '1.0'

export class ScenegraphAdapter {
  private readonly scenegraph: GLTFScenegraph
  private readonly vrmVersion: VRMMajorVersion
  private digestCache?: ScenegraphDigest
  private readonly materialDescriptorMap = new Map<string, number>()
  private readonly textureDescriptorMap = new Map<
    string,
    { textureIndex: number; texCoord?: number }
  >()
  private readonly materialDescriptors = new Map<string, AtlasMaterialDescriptor>()
  private readonly texturesMarkedForRemoval = new Set<number>()
  private readonly vrm0MaterialPropertyMap = new Map<number, VRM0MaterialProperty>()
  private dependencyBaseline?: MaterialTextureDependencyGraph
  private pendingPlacements: PendingMaterialPlacement[] = []

  private constructor(scenegraph: GLTFScenegraph, vrmVersion: VRMMajorVersion) {
    this.scenegraph = scenegraph
    this.vrmVersion = vrmVersion
  }

  static from(gltf: GLTFWithBuffers): Result<ScenegraphAdapter, OptimizationError> {
    const version = detectVRMMajorVersion(gltf)
    if (!version) {
      return err({
        type: 'UNSUPPORTED_VRM_VERSION' as const,
        message: 'Unsupported VRM document: expected VRM 0.x or VRM 1.0 extensions.',
      })
    }
    return ok(new ScenegraphAdapter(new GLTFScenegraph(gltf), version))
  }

  getVRMMajorVersion(): VRMMajorVersion {
    return this.vrmVersion
  }

  isVRM0(): boolean {
    return this.vrmVersion === '0.x'
  }

  isVRM10(): boolean {
    return this.vrmVersion === '1.0'
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

    this.ensureDependencyBaseline()
    const mimeType = options?.mimeType ?? 'image/png'
    const slotTextureIndexMap = this.addAtlasTextures(result.atlases, mimeType)
    const materials = this.scenegraph.json.materials ?? []

    for (const [descriptorId, descriptor] of this.materialDescriptors) {
      const materialId = this.materialDescriptorMap.get(descriptorId)
      if (materialId === undefined) {
        continue
      }
      const material = materials[materialId]
      if (!material) {
        continue
      }

      for (const texture of descriptor.textures) {
        const textureIndex = slotTextureIndexMap.get(texture.slot)
        if (textureIndex === undefined) {
          continue
        }
        const binding = this.textureDescriptorMap.get(texture.id)
        if (!binding) {
          continue
        }

        this.updateMaterialTexture(
          material,
          materialId,
          texture.slot,
          textureIndex,
          binding.texCoord,
        )
        this.texturesMarkedForRemoval.add(binding.textureIndex)
      }
    }

    this.pendingPlacements = this.buildPendingPlacements(result.placements)
  }

  flush(): void {
    this.removeTexturesWithDependencyDiff()
    this.scenegraph.createBinaryChunk()
    this.pendingPlacements = []
  }

  consumePendingPlacements(): PendingMaterialPlacement[] {
    if (!this.pendingPlacements.length) {
      return []
    }
    const placements = this.pendingPlacements
    this.pendingPlacements = []
    return placements
  }

  unwrap(): GLTFScenegraph {
    return this.scenegraph
  }

  private collectMaterials(): ScenegraphMaterialInfo[] {
    if (this.vrmVersion === '0.x') {
      return this.collectVRM0MToonMaterials()
    }
    return this.collectVRM10MToonMaterials()
  }

  private collectVRM10MToonMaterials(): ScenegraphMaterialInfo[] {
    const materials = this.scenegraph.json.materials ?? []
    const result: ScenegraphMaterialInfo[] = []

    materials.forEach((material, index) => {
      const mtoon = material.extensions?.VRMC_materials_mtoon
      if (!mtoon) {
        return
      }

      result.push({
        id: index,
        name: material.name,
        textures: this.buildVRM10TextureSlots(material, mtoon),
      })
    })

    return result
  }

  private collectVRM0MToonMaterials(): ScenegraphMaterialInfo[] {
    const vrmExtension = this.scenegraph.json.extensions?.VRM
    const materialProperties: VRM0MaterialProperty[] = vrmExtension?.materialProperties ?? []
    if (!materialProperties.length) {
      return []
    }

    this.vrm0MaterialPropertyMap.clear()

    const materials = this.scenegraph.json.materials ?? []
    const nameToIndex = new Map<string, number>()
    materials.forEach((material, index) => {
      if (material?.name) {
        nameToIndex.set(material.name, index)
      }
    })

    const result: ScenegraphMaterialInfo[] = []
    materialProperties.forEach((property, propIndex) => {
      if (!property || property.shader !== 'VRM/MToon') {
        return
      }

      const materialIndex =
        (property.name && nameToIndex.get(property.name)) ?? propIndex
      const material = materials[materialIndex]
      if (!material) {
        return
      }

      this.vrm0MaterialPropertyMap.set(materialIndex, property)

      result.push({
        id: materialIndex,
        name: material.name,
        textures: this.buildVRM0TextureSlots(property),
      })
    })

    return result
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

  private buildVRM10TextureSlots(material: any, mtoonExtension: any): MaterialTextureSlots {
    return {
      main: toTextureReference(material.pbrMetallicRoughness?.baseColorTexture),
      normal: toTextureReference(material.normalTexture),
      emission: toTextureReference(material.emissiveTexture),
      shadeMultiply: toTextureReference(mtoonExtension.shadeMultiplyTexture),
      rimMultiply: toTextureReference(mtoonExtension.rimMultiplyTexture),
      outlineWidth: toTextureReference(mtoonExtension.outlineWidthMultiplyTexture),
      matcap: toTextureReference(mtoonExtension.matcapTexture),
      uvAnimationMask: toTextureReference(mtoonExtension.uvAnimationMaskTexture),
    }
  }

  private buildVRM0TextureSlots(property: VRM0MaterialProperty): MaterialTextureSlots {
    const pick = (key: string): MaterialTextureReference | undefined => {
      const index = property.textureProperties?.[key]
      if (typeof index !== 'number' || index < 0) {
        return undefined
      }
      return { textureIndex: index }
    }

    return {
      main: pick('_MainTex'),
      shadeMultiply: pick('_ShadeTexture'),
      normal: pick('_BumpMap'),
      emission: pick('_EmissionMap'),
      rimMultiply: pick('_RimTexture'),
      outlineWidth: pick('_OutlineWidthTexture'),
      uvAnimationMask: pick('_UvAnimMaskTexture'),
    }
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

  private addAtlasTextures(
    atlases: AtlasBuildResult['atlases'],
    mimeType: string,
  ): Map<TextureSlot, number> {
    const slotTextureIndexMap = new Map<TextureSlot, number>()
    for (const atlas of atlases) {
      const imageIndex = this.scenegraph.addImage(atlas.atlasImage, mimeType)
      const textureIndex = this.scenegraph.addTexture({ imageIndex })
      slotTextureIndexMap.set(atlas.slot, textureIndex)
    }
    return slotTextureIndexMap
  }

  private buildPendingPlacements(placements: MaterialPlacement[]): PendingMaterialPlacement[] {
    const results: PendingMaterialPlacement[] = []
    for (const placement of placements) {
      const materialIndex = this.materialDescriptorMap.get(placement.materialId)
      if (materialIndex === undefined) {
        continue
      }

      const texCoord = this.getPrimaryTexCoordForDescriptor(placement.materialId)
      results.push({
        materialIndex,
        texCoord,
        uvTransform: placement.uvTransform,
      })
    }
    return results
  }

  private getPrimaryTexCoordForDescriptor(descriptorId: string): number {
    const descriptor = this.materialDescriptors.get(descriptorId)
    if (!descriptor) {
      return 0
    }

    const primaryTexture = descriptor.textures[descriptor.primaryTextureIndex]
    if (!primaryTexture) {
      return 0
    }

    const binding = this.textureDescriptorMap.get(primaryTexture.id)
    if (!binding) {
      return 0
    }

    return binding.texCoord ?? 0
  }

  private ensureDependencyBaseline(): void {
    if (!this.dependencyBaseline) {
      this.dependencyBaseline = this.buildMaterialTextureDependencyGraph()
    }
  }

  private buildMaterialTextureDependencyGraph(): MaterialTextureDependencyGraph {
    const textures = this.scenegraph.json.textures ?? []
    const materials = this.scenegraph.json.materials ?? []
    const graph: MaterialTextureDependencyGraph = {
      textures: new Set<number>(),
      images: new Set<number>(),
    }

    const registerTextureRef = (ref?: { index?: number }) => {
      if (ref?.index === undefined) {
        return
      }
      const textureIndex = ref.index
      graph.textures.add(textureIndex)
      const texture = textures[textureIndex]
      if (texture && typeof texture.source === 'number') {
        graph.images.add(texture.source)
      }
    }

    for (const material of materials) {
      registerTextureRef(material.pbrMetallicRoughness?.baseColorTexture)
      registerTextureRef(material.pbrMetallicRoughness?.metallicRoughnessTexture)
      registerTextureRef(material.normalTexture)
      registerTextureRef(material.emissiveTexture)
      registerTextureRef(material.occlusionTexture)

      const mtoonExtension = material.extensions?.VRMC_materials_mtoon
      if (mtoonExtension) {
        for (const field of Object.values(VRM10_TEXTURE_FIELD_MAP)) {
          registerTextureRef(mtoonExtension[field])
        }
      }
    }

    const vrmExtension = this.scenegraph.json.extensions?.VRM
    const materialProperties: VRM0MaterialProperty[] = vrmExtension?.materialProperties ?? []
    for (const property of materialProperties) {
      const textureProperties = property?.textureProperties ?? {}
      for (const value of Object.values(textureProperties)) {
        if (typeof value === 'number') {
          graph.textures.add(value)
          const texture = textures[value]
          if (texture && typeof texture.source === 'number') {
            graph.images.add(texture.source)
          }
        }
      }
    }

    return graph
  }

  private removeTexturesWithDependencyDiff(): void {
    if (!this.texturesMarkedForRemoval.size) {
      this.dependencyBaseline = undefined
      return
    }

    const baseline =
      this.dependencyBaseline ?? this.buildMaterialTextureDependencyGraph()
    const current = this.buildMaterialTextureDependencyGraph()

    const targets = [...this.texturesMarkedForRemoval]
      .filter(
        (textureIndex) =>
          baseline.textures.has(textureIndex) && !current.textures.has(textureIndex),
      )
      .sort((a, b) => b - a)

    for (const textureIndex of targets) {
      this.removeTextureAtIndex(textureIndex)
    }

    this.texturesMarkedForRemoval.clear()
    this.dependencyBaseline = undefined
  }

  private removeTextureAtIndex(textureIndex: number): void {
    const textures = this.scenegraph.json.textures
    if (!textures || textureIndex < 0 || textureIndex >= textures.length) {
      return
    }

    const [removed] = textures.splice(textureIndex, 1)
    this.adjustMaterialTextureIndices(textureIndex)
    this.adjustVRMTextureIndices(textureIndex)

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

  private adjustVRMTextureIndices(removedIndex: number): void {
    if (removedIndex < 0) {
      return
    }
    this.adjustVRM0TextureIndices(removedIndex)
    this.adjustVRM10TextureIndices(removedIndex)
  }

  private adjustVRM0TextureIndices(removedIndex: number): void {
    const vrmExtension = this.scenegraph.json.extensions?.VRM
    const materialProperties: VRM0MaterialProperty[] = vrmExtension?.materialProperties ?? []
    for (const property of materialProperties) {
      const textures = property.textureProperties
      if (!textures) {
        continue
      }

      for (const key of Object.keys(textures)) {
        const value = textures[key]
        if (typeof value !== 'number') {
          continue
        }
        if (value === removedIndex) {
          delete textures[key]
        } else if (value > removedIndex) {
          textures[key] = value - 1
        }
      }
    }
  }

  private adjustVRM10TextureIndices(removedIndex: number): void {
    const materials = this.scenegraph.json.materials ?? []
    for (const material of materials) {
      const mtoonExtension = material.extensions?.VRMC_materials_mtoon
      if (!mtoonExtension) {
        continue
      }

      for (const field of Object.values(VRM10_TEXTURE_FIELD_MAP)) {
        const textureInfo = mtoonExtension[field]
        if (!textureInfo || typeof textureInfo.index !== 'number') {
          continue
        }

        if (textureInfo.index === removedIndex) {
          delete mtoonExtension[field]
        } else if (textureInfo.index > removedIndex) {
          textureInfo.index -= 1
        }
      }
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
    materialId: number,
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
        this.updateVRM0SlotTexture(materialId, slot, textureIndex)
        break
      }
      case 'normal': {
        const existing = material.normalTexture ?? {}
        material.normalTexture = {
          ...existing,
          index: textureIndex,
          texCoord: texCoord ?? existing.texCoord,
        }
        this.updateVRM0SlotTexture(materialId, slot, textureIndex)
        break
      }
      case 'emissive': {
        const existing = material.emissiveTexture ?? {}
        material.emissiveTexture = {
          ...existing,
          index: textureIndex,
          texCoord: texCoord ?? existing.texCoord,
        }
        this.updateVRM0SlotTexture(materialId, slot, textureIndex)
        break
      }
      default:
        if (slot.startsWith('custom:')) {
          this.updateMToonCustomTexture(material, materialId, slot, textureIndex, texCoord)
        }
        break
    }
  }

  private updateMToonCustomTexture(
    material: any,
    materialId: number,
    slot: TextureSlot,
    textureIndex: number,
    texCoord?: number,
  ): void {
    if (this.vrmVersion === '0.x') {
      this.updateVRM0SlotTexture(materialId, slot, textureIndex)
      return
    }

    const field = VRM10_TEXTURE_FIELD_MAP[slot]
    if (!field) {
      return
    }

    const mtoonExtension = material.extensions?.VRMC_materials_mtoon
    if (!mtoonExtension) {
      return
    }

    const existing = mtoonExtension[field] ?? {}
    mtoonExtension[field] = {
      ...existing,
      index: textureIndex,
      texCoord: texCoord ?? existing.texCoord,
    }
  }

  private updateVRM0SlotTexture(materialId: number, slot: TextureSlot, textureIndex: number): void {
    if (this.vrmVersion !== '0.x') {
      return
    }
    const propertyKey = VRM0_TEXTURE_PROPERTY_MAP[slot]
    if (!propertyKey) {
      return
    }
    const property = this.findVRM0MaterialProperty(materialId)
    if (!property) {
      return
    }
    property.textureProperties = property.textureProperties ?? {}
    property.textureProperties[propertyKey] = textureIndex
  }

  private findVRM0MaterialProperty(materialId: number): VRM0MaterialProperty | undefined {
    if (this.vrmVersion !== '0.x') {
      return undefined
    }
    const cached = this.vrm0MaterialPropertyMap.get(materialId)
    if (cached) {
      return cached
    }

    const vrmExtension = this.scenegraph.json.extensions?.VRM
    const materialProperties: VRM0MaterialProperty[] = vrmExtension?.materialProperties ?? []
    if (!materialProperties.length) {
      return undefined
    }

    const materials = this.scenegraph.json.materials ?? []
    const material = materials[materialId]
    if (!material) {
      return undefined
    }

    const matched =
      (material.name &&
        materialProperties.find((property) => property?.name === material.name)) ??
      materialProperties[materialId]

    if (matched) {
      this.vrm0MaterialPropertyMap.set(materialId, matched)
    }

    return matched
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

function detectVRMMajorVersion(gltf: GLTFWithBuffers): VRMMajorVersion | null {
  const extensions = gltf.json.extensions ?? {}
  if (extensions && typeof extensions === 'object') {
    if ('VRM' in extensions) {
      return '0.x'
    }
    if ('VRMC_vrm' in extensions) {
      return '1.0'
    }
  }

  const extensionsUsed = gltf.json.extensionsUsed ?? []
  if (extensionsUsed.includes('VRM')) {
    return '0.x'
  }
  if (extensionsUsed.includes('VRMC_vrm')) {
    return '1.0'
  }

  const extensionsRequired = gltf.json.extensionsRequired ?? []
  if (extensionsRequired.includes('VRM')) {
    return '0.x'
  }
  if (extensionsRequired.includes('VRMC_vrm')) {
    return '1.0'
  }

  return null
}
