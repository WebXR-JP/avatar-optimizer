import { err, ok, Result } from "neverthrow"
import { AtlasImageMap, AtlasTextureDescriptor, MTOON_TEXTURE_SLOTS, OffsetScale, OptimizationError, PatternMaterialMapping } from "../types"
import { MToonMaterial } from "@pixiv/three-vrm"
import { ImageMatrixPair } from "./types"
import { composeImagesToAtlas } from "./image"

/**
 * null 要素を有効なテクスチャの平均寸法で埋める
 * 平均値は 2 の n 乗に丸める
 *
 * @param textures - null を含む可能性のあるテクスチャ配列
 * @returns 全て有効な値で埋められたテクスチャ配列
 */
export function fillNullTexturesWithAverageDimensions(
  textures: Array<AtlasTextureDescriptor | null>
): AtlasTextureDescriptor[]
{
  // 有効なテクスチャの寸法を収集
  const validTextures = textures.filter(
    (t): t is AtlasTextureDescriptor => t !== null
  )

  // 有効なテクスチャがない場合のフォールバック
  if (validTextures.length === 0)
  {
    return textures.map((t) => t ?? { width: 512, height: 512 })
  }

  // 平均幅・高さを計算
  const avgWidth =
    validTextures.reduce((sum, t) => sum + t.width, 0) / validTextures.length
  const avgHeight =
    validTextures.reduce((sum, t) => sum + t.height, 0) / validTextures.length

  // 平均値を 2 の n 乗に丸める
  const roundedWidth = roundToNearestPowerOfTwo(avgWidth)
  const roundedHeight = roundToNearestPowerOfTwo(avgHeight)

  return textures.map((t) =>
    t ?? { width: roundedWidth, height: roundedHeight }
  )
}

/**
 * 値を最も近い 2 の n 乗に丸める
 * 例: 512 -> 512, 600 -> 512, 700 -> 1024
 *
 * @param value - 丸める値
 * @returns 最も近い 2 の n 乗
 */
function roundToNearestPowerOfTwo(value: number): number
{
  if (value <= 0) return 512 // デフォルト値

  // 下の 2 の n 乗
  const lower = Math.pow(2, Math.floor(Math.log2(value)))
  // 上の 2 の n 乗
  const upper = lower * 2

  // より近い方を返す
  return value - lower < upper - value ? lower : upper
}

/**
 * テクスチャ組み合わせパターンに基づいてアトラス画像を生成
 * 各スロットごとに、一意なパターンのテクスチャのみをアトラス化
 *
 * @param materials - 全マテリアル配列
 * @param patternMappings - パターンとマテリアルのマッピング
 * @param patternPlacements - パターンごとのUV変換行列
 * @returns スロット名をキーにしたアトラス画像のマップ
 */
export async function generateAtlasImagesFromPatterns(
  materials: MToonMaterial[],
  patternMappings: PatternMaterialMapping[],
  patternPlacements: OffsetScale[]
): Promise<Result<AtlasImageMap, OptimizationError>>
{
  if (patternMappings.length !== patternPlacements.length)
  {
    return err({
      type: 'INVALID_MATERIAL_TYPE',
      message: 'Pattern mappings and placements length mismatch',
    })
  }

  const atlasMap: Partial<AtlasImageMap> = {}

  for (const slot of MTOON_TEXTURE_SLOTS)
  {
    const layers: ImageMatrixPair[] = []

    // 各パターンについて、最初のマテリアルからテクスチャを取得
    for (let i = 0; i < patternMappings.length; i++)
    {
      const mapping = patternMappings[i]
      const placement = patternPlacements[i]

      // このパターンの最初のマテリアルを代表として使用
      const representativeMaterialIndex = mapping.materialIndices[0]
      const material = materials[representativeMaterialIndex]

      const texture = material[slot]
      if (texture)
      {
        layers.push({
          image: texture,
          uvTransform: placement
        })
      }
    }

    const atlasResult = composeImagesToAtlas(layers, {
      width: 2048,
      height: 2048,
    })

    if (atlasResult.isErr())
    {
      return err({
        type: 'ATLAS_GENERATION_FAILED',
        message: `Failed to generate atlas for slot ${slot}: ${atlasResult.error.message}`,
        cause: atlasResult.error,
      })
    }

    atlasMap[slot] = atlasResult.value
  }

  return ok(atlasMap as AtlasImageMap)
}

/**
 * 各チャンネル(例: MainTex, BumpMap)ごとのアトラス画像を生成する
 * 現状はMToonMaterialのみ対応
 *
 * @param materials - アトラス化対象のマテリアル配列
 * @param placements - マテリアルごとのパッキング情報配列
 * @returns スロット名をキーにしたアトラス画像のマップ
 */
export async function generateAtlasImages(
  materials: MToonMaterial[],
  placements: OffsetScale[]
): Promise<Result<AtlasImageMap, OptimizationError>>
{
  if (materials.length !== placements.length)
  {
    return err({
      type: 'INVALID_MATERIAL_TYPE',
      message: 'Materials and packing infos length mismatch',
    })
  }

  const atlasMap: Partial<AtlasImageMap> = {}

  for (const slot of MTOON_TEXTURE_SLOTS)
  {
    const layers: ImageMatrixPair[] = []

    for (let i = 0; i < materials.length; i++)
    {
      const mat = materials[i]
      const placement = placements[i]

      const texture = mat[slot]
      if (texture)
      {
        layers.push({
          image: texture,
          uvTransform: placement,
        })
      }
    }

    const atlasResult = composeImagesToAtlas(layers, {
      width: 2048,
      height: 2048,
    })

    if (atlasResult.isErr())
    {
      return err({
        type: 'ATLAS_GENERATION_FAILED',
        message: `Failed to generate atlas for slot ${slot}: ${atlasResult.error.message}`,
        cause: atlasResult.error,
      })
    }

    atlasMap[slot] = atlasResult.value
  }

  return ok(atlasMap as AtlasImageMap)
}
