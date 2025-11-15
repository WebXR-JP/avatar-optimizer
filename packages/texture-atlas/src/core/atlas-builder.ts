/**
 * Core atlas builder
 *
 * マテリアル記述子とテクスチャスロットごとのアトラス画像、
 * そしてマテリアル単位の UV 変換行列を生成する責務を持つ。
 */

import { drawImagesToAtlasBuffer } from '../atlas/draw-image-jimp'
import { packTextures } from '../atlas/packing'
import { toNormalizedPackingResult } from '../atlas/packing-utils'
import type {
  AtlasMaterialDescriptor,
  AtlasOptions,
  AtlasBuildResult,
  MaterialPlacement,
  NormalizedPackedTexture,
  NormalizedPackingResult,
  PackedTexture,
  SlotAtlasImage,
} from '../types'

export async function buildAtlases(
  materials: AtlasMaterialDescriptor[],
  size: number = 2048,
): Promise<AtlasBuildResult>
{
  const textures = materials.map(m => m.textures[0])

  const packing = await packTextures(textures, size, size)
  const normalizedPacking = toNormalizedPackingResult(packing)

  const pixelRectsByMaterialId = new Map<string, PackedTexture>()
  packing.packed.forEach((packedRect) =>
  {
    const context = contexts[packedRect.index]
    if (!context) return
    pixelRectsByMaterialId.set(context.material.id, packedRect)
  })

  const normalizedRectsByMaterialId = new Map<string, NormalizedPackedTexture>()
  normalizedPacking.packed.forEach((normalizedRect) =>
  {
    const context = contexts[normalizedRect.index]
    if (!context) return
    normalizedRectsByMaterialId.set(context.material.id, normalizedRect)
  })

  const placements = buildPlacements(contexts, normalizedRectsByMaterialId)
  const atlases = await buildSlotAtlases(
    contexts,
    normalizedPacking,
    normalizedRectsByMaterialId,
    pixelRectsByMaterialId,
  )

  return {
    atlases,
    placements,
  }
}

function buildPlacements(
  contexts: MaterialBuildContext[],
  normalizedRectsByMaterialId: Map<string, NormalizedPackedTexture>,
): MaterialPlacement[]
{
  return contexts.map((context) =>
  {
    const normalized = normalizedRectsByMaterialId.get(context.material.id)
    if (!normalized)
    {
      throw new Error(`Missing normalized packing data for material ${context.material.id}`)
    }

    const scaleU = normalized.uvMax.u - normalized.uvMin.u
    const scaleV = normalized.uvMax.v - normalized.uvMin.v
    const translateU = normalized.uvMin.u
    const translateV = normalized.uvMin.v

    const uvTransform: MaterialPlacement['uvTransform'] = [
      scaleU,
      0,
      translateU,
      0,
      scaleV,
      translateV,
      0,
      0,
      1,
    ]

    return {
      materialId: context.material.id,
      uvTransform,
    }
  })
}

async function buildSlotAtlases(
  contexts: MaterialBuildContext[],
  normalizedPacking: NormalizedPackingResult,
  normalizedRectsByMaterialId: Map<string, NormalizedPackedTexture>,
  pixelRectsByMaterialId: Map<string, PackedTexture>,
): Promise<SlotAtlasImage[]>
{
  const slots = collectSlots(contexts)
  const textureDataCache = new Map<string, Promise<Uint8ClampedArray>>()

  const atlases: SlotAtlasImage[] = []

  for (const slot of slots)
  {
    const slotEntries = contexts
      .map((context) =>
      {
        const texture = context.texturesBySlot.get(slot)
        if (!texture) return null

        const normalizedRect = normalizedRectsByMaterialId.get(context.material.id)
        const pixelRect = pixelRectsByMaterialId.get(context.material.id)
        if (!normalizedRect || !pixelRect) return null

        return {
          context,
          texture,
          normalizedRect,
          pixelRect,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

    if (!slotEntries.length)
    {
      continue
    }

    const images = await Promise.all(
      slotEntries.map((entry) => loadTextureData(entry.texture, textureDataCache)),
    )

    const slotPacking: NormalizedPackingResult = {
      atlasWidth: normalizedPacking.atlasWidth,
      atlasHeight: normalizedPacking.atlasHeight,
      packed: slotEntries.map((entry, index) => ({
        index,
        uvMin: { ...entry.normalizedRect.uvMin },
        uvMax: { ...entry.normalizedRect.uvMax },
        sourceWidth: entry.texture.width,
        sourceHeight: entry.texture.height,
        scaledWidth: entry.pixelRect.width,
        scaledHeight: entry.pixelRect.height,
      })),
    }

    const atlasImage = await drawImagesToAtlasBuffer(slotPacking, images)

    atlases.push({
      slot,
      atlasImage,
      atlasWidth: normalizedPacking.atlasWidth,
      atlasHeight: normalizedPacking.atlasHeight,
    })
  }

  return atlases
}

function collectSlots(contexts: MaterialBuildContext[]): TextureSlot[]
{
  const slotSet = new Set<TextureSlot>()
  contexts.forEach((context) =>
  {
    context.material.textures.forEach((texture) =>
    {
      slotSet.add(texture.slot)
    })
  })
  return Array.from(slotSet)
}

async function loadTextureData(
  texture: AtlasMaterialDescriptor['textures'][number],
  cache: Map<string, Promise<Uint8ClampedArray>>,
): Promise<Uint8ClampedArray>
{
  if (!cache.has(texture.id))
  {
    cache.set(
      texture.id,
      (async () =>
      {
        const data = await texture.readImageData()
        if (data instanceof Uint8ClampedArray)
        {
          return data
        }
        return new Uint8ClampedArray(data)
      })(),
    )
  }

  return cache.get(texture.id) as Promise<Uint8ClampedArray>
}
