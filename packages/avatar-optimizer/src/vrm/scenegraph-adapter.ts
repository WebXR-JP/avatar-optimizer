import type {
  AtlasBuildResult,
  AtlasMaterialDescriptor,
  AtlasTextureDescriptor,
  SlotAtlasImage,
  TextureSlot,
} from '@xrift/avatar-optimizer-texture-atlas'
import { err, ok, type Result } from 'neverthrow'
import type { MToonMaterial, VRM } from '@pixiv/three-vrm'
import
{
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

export interface PendingMaterialPlacement
{
  materialUuid: string
  uvTransform: [number, number, number, number, number, number, number, number, number]
}

export async function createAtlasMaterialDescriptors(materials: MToonMaterial[]): Promise<AtlasMaterialDescriptor[]>
{
  const descriptors: AtlasMaterialDescriptor[] = []

  for (const material of materials)
  {
    const descriptorTextures: AtlasTextureDescriptor[] = []
    for (const binding of textureBindings)
    {
      const descriptor = await this.toAtlasTextureDescriptor(material, binding)
      if (descriptor)
      {
        descriptorTextures.push(descriptor)
      }
    }

    if (!descriptorTextures.length)
    {
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

export class ScenegraphAdapter
{
  private readonly materialContexts = new Map<string, ProcessableMaterialContext>()

  static from(vrm: VRM): Result<ScenegraphAdapter, OptimizationError>
  {
    return ok(new ScenegraphAdapter())
  }


  async applyAtlasResult(result: AtlasBuildResult): Promise<PendingMaterialPlacement[]>
  {
    if (!result.atlases.length)
    {
      return []
    }

    const atlasTextures = await this.createAtlasTextures(result.atlases)
    const placements: PendingMaterialPlacement[] = []

    for (const placement of result.placements)
    {
      const context = this.materialContexts.get(placement.materialId)
      if (!context)
      {
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


  private async createAtlasTextures(
    atlases: SlotAtlasImage[],
  ): Promise<Map<TextureSlot, Texture>>
  {
    const textures = new Map<TextureSlot, Texture>()

    for (const atlas of atlases)
    {
      const texture = await this.buildTextureFromAtlas(atlas)
      textures.set(atlas.slot, texture)
    }

    return textures
  }

  private async buildTextureFromAtlas(atlas: SlotAtlasImage): Promise<Texture>
  {
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
  ): void
  {
    const material = context.material as any
    let updated = false

    const assign = (slot: TextureSlot, property: string) =>
    {
      const texture = atlasTextures.get(slot)
      if (texture)
      {
        material[property] = texture
        updated = true
      }
    }

    assign('baseColor', 'map')
    assign('normal', 'normalMap')
    assign('emissive', 'emissiveMap')

    if (isMToonMaterial(material))
    {
      assign(SHADE_SLOT, 'shadeMultiplyTexture')
      assign(RIM_SLOT, 'rimMultiplyTexture')
      assign(OUTLINE_SLOT, 'outlineWidthMultiplyTexture')
      assign(MATCAP_SLOT, 'matcapTexture')
      assign(UV_MASK_SLOT, 'uvAnimationMaskTexture')
    }

    if (updated)
    {
      context.material.needsUpdate = true
    }
  }
}

async function toAtlasTextureDescriptor(
  material: Material,
): Promise<AtlasTextureDescriptor | null>
{
  try
  {
    const imageData = await extractTextureImage(material.)
    const textureId = `material:${material.uuid}:${binding.slot}`
    return {
      id: textureId,
      slot: binding.slot,
      width: imageData.width,
      height: imageData.height,
      readImageData: async () => imageData.data,
    }
  } catch (error)
  {
    console.warn(
      `[ScenegraphAdapter] Failed to decode texture for ${binding.slot}: ${String(error)}`,
    )
    return null
  }
}
