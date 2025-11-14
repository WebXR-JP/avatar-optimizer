import type {
  AtlasBuildResult,
  AtlasMaterialDescriptor,
  AtlasTextureDescriptor,
  SlotAtlasImage,
  TextureSlot,
} from '@xrift/avatar-optimizer-texture-atlas'
import { err, ok, type Result } from 'neverthrow'
import type { MToonMaterial } from '@pixiv/three-vrm-materials-mtoon'
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Material,
  type Texture,
} from 'three'

import type { OptimizationError, ThreeVRMDocument } from '../types'

const SHADE_SLOT = 'custom:shadeMultiply' as const
const RIM_SLOT = 'custom:rimMultiply' as const
const OUTLINE_SLOT = 'custom:outlineWidth' as const
const MATCAP_SLOT = 'custom:matcap' as const
const UV_MASK_SLOT = 'custom:uvAnimationMask' as const

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

interface MaterialTextureBinding {
  slot: TextureSlot
  texture: Texture
}

interface ProcessableMaterialContext {
  material: Material
}

export interface PendingMaterialPlacement {
  materialUuid: string
  uvTransform: [number, number, number, number, number, number, number, number, number]
}

export class ScenegraphAdapter {
  private readonly materials: Material[]
  private readonly materialContexts = new Map<string, ProcessableMaterialContext>()

  private constructor(document: ThreeVRMDocument) {
    this.materials = (document.vrm.materials ?? []).filter(isProcessableMaterial)
  }

  static from(document: ThreeVRMDocument): Result<ScenegraphAdapter, OptimizationError> {
    if (!document?.vrm || !document.gltf) {
      return err({
        type: 'INVALID_FILE_TYPE',
        message: 'Invalid three-vrm document.',
      })
    }
    return ok(new ScenegraphAdapter(document))
  }

  async createAtlasMaterialDescriptors(): Promise<AtlasMaterialDescriptor[]> {
    this.materialContexts.clear()
    const descriptors: AtlasMaterialDescriptor[] = []

    for (const material of this.materials) {
      const textureBindings = this.collectTextureBindings(material)
      if (!textureBindings.length) {
        continue
      }

      const descriptorTextures: AtlasTextureDescriptor[] = []
      for (const binding of textureBindings) {
        const descriptor = await this.toAtlasTextureDescriptor(material, binding)
        if (descriptor) {
          descriptorTextures.push(descriptor)
        }
      }

      if (!descriptorTextures.length) {
        continue
      }

      const primaryIndex = selectPrimaryTextureIndex(descriptorTextures)

      descriptors.push({
        id: material.uuid,
        textures: descriptorTextures,
        primaryTextureIndex: primaryIndex,
      })

      this.materialContexts.set(material.uuid, {
        material,
      })
    }

    return descriptors
  }

  async applyAtlasResult(result: AtlasBuildResult): Promise<PendingMaterialPlacement[]> {
    if (!result.atlases.length) {
      return []
    }

    const atlasTextures = await this.createAtlasTextures(result.atlases)
    const placements: PendingMaterialPlacement[] = []

    for (const placement of result.placements) {
      const context = this.materialContexts.get(placement.materialId)
      if (!context) {
        continue
      }

      this.applyAtlasTextures(context, atlasTextures)
      placements.push({
        materialUuid: context.material.uuid,
        uvTransform: placement.uvTransform,
      })
    }

    return placements
  }

  private collectTextureBindings(material: Material): MaterialTextureBinding[] {
    const bindings: MaterialTextureBinding[] = []
    const baseTexture = (material as any).map as Texture | null | undefined
    if (baseTexture) {
      bindings.push({ slot: 'baseColor', texture: baseTexture })
    }

    const normalTexture = (material as any).normalMap as Texture | null | undefined
    if (normalTexture) {
      bindings.push({ slot: 'normal', texture: normalTexture })
    }

    const emissiveTexture = (material as any).emissiveMap as Texture | null | undefined
    if (emissiveTexture) {
      bindings.push({ slot: 'emissive', texture: emissiveTexture })
    }

    if (isMToonMaterial(material)) {
      pushIfTexture(bindings, material, SHADE_SLOT, material.shadeMultiplyTexture)
      pushIfTexture(bindings, material, RIM_SLOT, material.rimMultiplyTexture)
      pushIfTexture(bindings, material, OUTLINE_SLOT, material.outlineWidthMultiplyTexture)
      pushIfTexture(bindings, material, MATCAP_SLOT, material.matcapTexture)
      pushIfTexture(bindings, material, UV_MASK_SLOT, material.uvAnimationMaskTexture)
    }

    return bindings
  }

  private async toAtlasTextureDescriptor(
    material: Material,
    binding: MaterialTextureBinding,
  ): Promise<AtlasTextureDescriptor | null> {
    try {
      const imageData = await extractTextureImage(binding.texture)
      const textureId = `material:${material.uuid}:${binding.slot}`
      return {
        id: textureId,
        slot: binding.slot,
        width: imageData.width,
        height: imageData.height,
        readImageData: async () => imageData.data,
      }
    } catch (error) {
      console.warn(
        `[ScenegraphAdapter] Failed to decode texture for ${binding.slot}: ${String(error)}`,
      )
      return null
    }
  }

  private async createAtlasTextures(
    atlases: SlotAtlasImage[],
  ): Promise<Map<TextureSlot, Texture>> {
    const textures = new Map<TextureSlot, Texture>()

    for (const atlas of atlases) {
      const texture = await this.buildTextureFromAtlas(atlas)
      textures.set(atlas.slot, texture)
    }

    return textures
  }

  private async buildTextureFromAtlas(atlas: SlotAtlasImage): Promise<Texture> {
    const jimp = await loadJimpModule()
    const binary =
      typeof Buffer !== 'undefined'
        ? Buffer.from(atlas.atlasImage)
        : new Uint8Array(atlas.atlasImage)
    const image = await jimp.read(binary)
    const rgba = ensureUint8ClampedArray(image.bitmap.data)

    const texture = new DataTexture(
      cloneToUint8Array(rgba),
      atlas.atlasWidth,
      atlas.atlasHeight,
      RGBAFormat,
      UnsignedByteType,
    )
    texture.colorSpace = atlas.slot === 'normal' ? NoColorSpace : SRGBColorSpace
    texture.needsUpdate = true
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping

    return texture
  }

  private applyAtlasTextures(
    context: ProcessableMaterialContext,
    atlasTextures: Map<TextureSlot, Texture>,
  ): void {
    const material = context.material as any
    let updated = false

    const assign = (slot: TextureSlot, property: string) => {
      const texture = atlasTextures.get(slot)
      if (texture) {
        material[property] = texture
        updated = true
      }
    }

    assign('baseColor', 'map')
    assign('normal', 'normalMap')
    assign('emissive', 'emissiveMap')

    if (isMToonMaterial(material)) {
      assign(SHADE_SLOT, 'shadeMultiplyTexture')
      assign(RIM_SLOT, 'rimMultiplyTexture')
      assign(OUTLINE_SLOT, 'outlineWidthMultiplyTexture')
      assign(MATCAP_SLOT, 'matcapTexture')
      assign(UV_MASK_SLOT, 'uvAnimationMaskTexture')
    }

    if (updated) {
      context.material.needsUpdate = true
    }
  }
}

function isProcessableMaterial(material: Material | null | undefined): material is Material {
  if (!material) {
    return false
  }
  if (isMToonMaterial(material)) {
    return true
  }
  return Boolean((material as any).map || (material as any).normalMap || (material as any).emissiveMap)
}

function isMToonMaterial(material: Material): material is MToonMaterial {
  return Boolean((material as any).isMToonMaterial)
}

function pushIfTexture(
  bindings: MaterialTextureBinding[],
  _material: Material,
  slot: TextureSlot,
  texture: Texture | null,
): void {
  if (texture) {
    bindings.push({ slot, texture })
  }
}

function selectPrimaryTextureIndex(textures: AtlasTextureDescriptor[]): number {
  for (const slot of PRIMARY_SLOT_PRIORITY) {
    const match = textures.findIndex((texture) => texture.slot === slot)
    if (match >= 0) {
      return match
    }
  }
  return 0
}

async function extractTextureImage(texture: Texture): Promise<{
  width: number
  height: number
  data: Uint8ClampedArray
}> {
  const source = (texture as any).image
  if (!source) {
    throw new Error('Texture does not contain image data')
  }

  if (isDataTextureSource(source)) {
    return {
      width: source.width,
      height: source.height,
      data: ensureUint8ClampedArray(source.data),
    }
  }

  if (isImageDataLike(source)) {
    return {
      width: source.width,
      height: source.height,
      data: ensureUint8ClampedArray(source.data),
    }
  }

  if (isCanvasLike(source)) {
    const ctx = source.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to acquire 2D context from texture canvas')
    }
    const imageData = ctx.getImageData(0, 0, source.width, source.height)
    return {
      width: imageData.width,
      height: imageData.height,
      data: ensureUint8ClampedArray(imageData.data),
    }
  }

  if (await hasCanvasSupport()) {
    const { canvas, ctx } = await createCanvas(source.width, source.height)
    ctx.drawImage(source, 0, 0)
    const imageData = ctx.getImageData(0, 0, source.width, source.height)
    return {
      width: imageData.width,
      height: imageData.height,
      data: ensureUint8ClampedArray(imageData.data),
    }
  }

  throw new Error('Unsupported texture image source')
}

type ImageDataLike = { data: Uint8Array | Uint8ClampedArray; width: number; height: number }
type DataTextureSource = { data: Uint8Array | Uint8ClampedArray; width: number; height: number }
type CanvasLike = {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
}

function isImageDataLike(source: unknown): source is ImageDataLike {
  return Boolean(
    source &&
      typeof (source as ImageDataLike).width === 'number' &&
      typeof (source as ImageDataLike).height === 'number' &&
      (source as ImageDataLike).data,
  )
}

function isDataTextureSource(source: unknown): source is DataTextureSource {
  return (
    typeof source === 'object' &&
    source !== null &&
    'data' in source &&
    'width' in source &&
    'height' in source
  )
}

function isCanvasLike(source: any): source is CanvasLike {
  return Boolean(source && typeof source.getContext === 'function')
}

async function hasCanvasSupport(): Promise<boolean> {
  if (typeof OffscreenCanvas !== 'undefined') {
    return true
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    return true
  }
  const module = await loadNodeCanvasModule()
  return Boolean(module)
}

async function createCanvas(
  width: number,
  height: number,
): Promise<{
  canvas: CanvasLike
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
}> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to obtain OffscreenCanvas 2D context')
    }
    return { canvas: canvas as unknown as CanvasLike, ctx }
  }

  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to obtain CanvasRenderingContext2D')
    }
    return { canvas: canvas as unknown as CanvasLike, ctx }
  }

  const nodeCanvas = await loadNodeCanvasModule()
  if (!nodeCanvas) {
    throw new Error('Canvas implementation is not available in this environment')
  }

  const canvas = nodeCanvas.createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to obtain node-canvas context')
  }
  return { canvas: canvas as unknown as CanvasLike, ctx }
}

function cloneToUint8Array(data: Uint8ClampedArray): Uint8Array {
  const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  return new Uint8Array(slice)
}

function ensureUint8ClampedArray(data: Uint8Array | Uint8ClampedArray): Uint8ClampedArray {
  if (data instanceof Uint8ClampedArray) {
    return data
  }
  const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  return new Uint8ClampedArray(slice)
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

type CanvasModule = typeof import('canvas')
let canvasModulePromise: Promise<CanvasModule | null> | null = null

async function loadNodeCanvasModule(): Promise<CanvasModule | null> {
  if (!canvasModulePromise) {
    canvasModulePromise = import('canvas').catch(() => null)
  }
  return canvasModulePromise
}
