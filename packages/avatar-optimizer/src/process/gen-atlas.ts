import { MToonMaterial } from '@pixiv/three-vrm'
import { err, ok, Result, safeTry } from 'neverthrow'
import { OptimizationError } from '..'
import {
  AtlasGenerationOptions,
  AtlasImageMap,
  MTOON_TEXTURE_SLOT_COLOR_SPACES,
  MTOON_TEXTURE_SLOTS,
  MToonTextureSlot,
  OffsetScale,
  PatternMaterialMapping,
} from '../types'
import { composeImagesToAtlas } from '../util/texture/composite'
import { ImageMatrixPair } from '../util/texture/types'

/** デフォルトのアトラス解像度 */
const DEFAULT_ATLAS_RESOLUTION = 2048

/**
 * スロットのアトラス解像度を取得
 */
function getSlotResolution(
  slot: MToonTextureSlot,
  options?: AtlasGenerationOptions,
): number {
  const defaultRes = options?.defaultResolution ?? DEFAULT_ATLAS_RESOLUTION
  return options?.slotResolutions?.[slot] ?? defaultRes
}

/**
 * テクスチャ組み合わせパターンに基づいてアトラス画像を生成
 * 各スロットごとに、一意なパターンのテクスチャのみをアトラス化
 *
 * @param materials - 全マテリアル配列
 * @param patternMappings - パターンとマテリアルのマッピング
 * @param patternPlacements - パターンごとのUV変換行列
 * @param options - アトラス生成オプション（スロットごとの解像度指定など）
 * @returns スロット名をキーにしたアトラス画像のマップ
 */
export function generateAtlasImagesFromPatterns(
  materials: MToonMaterial[],
  patternMappings: PatternMaterialMapping[],
  patternPlacements: OffsetScale[],
  options?: AtlasGenerationOptions,
): Result<AtlasImageMap, OptimizationError> {
  return safeTry(function* () {
    if (patternMappings.length !== patternPlacements.length) {
      return err({
        type: 'INVALID_OPERATION',
        message: 'Pattern mappings and placements length mismatch',
      })
    }

    const atlasMap: Partial<AtlasImageMap> = {}

    for (const slot of MTOON_TEXTURE_SLOTS) {
      const layers: ImageMatrixPair[] = []

      // 各パターンについて、最初のマテリアルからテクスチャを取得
      for (let i = 0; i < patternMappings.length; i++) {
        const mapping = patternMappings[i]
        const placement = patternPlacements[i]

        // このパターンの最初のマテリアルを代表として使用
        const representativeMaterialIndex = mapping.materialIndices[0]
        const material = materials[representativeMaterialIndex]

        const texture = material[slot]
        if (texture) {
          layers.push({
            image: texture,
            uvTransform: placement,
          })
        }
      }

      const resolution = getSlotResolution(slot, options)
      const atlas = yield* composeImagesToAtlas(layers, {
        width: resolution,
        height: resolution,
        colorSpace: MTOON_TEXTURE_SLOT_COLOR_SPACES[slot],
      })

      atlasMap[slot] = atlas
    }

    return ok(atlasMap as AtlasImageMap)
  })
}
