import { MToonMaterial } from '@pixiv/three-vrm'
import { err, ok, Result, safeTry } from 'neverthrow'
import { OptimizationError } from '..'
import {
  AtlasImageMap,
  MTOON_TEXTURE_SLOTS,
  OffsetScale,
  PatternMaterialMapping,
} from '../types'
import { composeImagesToAtlas } from '../util/texture/composite'
import { ImageMatrixPair } from '../util/texture/types'

/**
 * テクスチャ組み合わせパターンに基づいてアトラス画像を生成
 * 各スロットごとに、一意なパターンのテクスチャのみをアトラス化
 *
 * @param materials - 全マテリアル配列
 * @param patternMappings - パターンとマテリアルのマッピング
 * @param patternPlacements - パターンごとのUV変換行列
 * @returns スロット名をキーにしたアトラス画像のマップ
 */
export function generateAtlasImagesFromPatterns(
  materials: MToonMaterial[],
  patternMappings: PatternMaterialMapping[],
  patternPlacements: OffsetScale[],
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

      const atlas = yield* composeImagesToAtlas(layers, {
        width: 2048,
        height: 2048,
      })

      atlasMap[slot] = atlas
    }

    return ok(atlasMap as AtlasImageMap)
  })
}
