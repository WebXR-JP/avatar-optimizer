import { MToonMaterial } from '@pixiv/three-vrm'
import { err, ok, Result, safeTry } from 'neverthrow'
import {
  DataTexture,
  NoColorSpace,
  RGBAFormat,
  Texture,
  UnsignedByteType,
} from 'three'
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
 * テクスチャスロットごとのデフォルト塗りつぶし色（RGBA 0-255）
 *
 * テクスチャを持たないマテリアルがアトラス内で黒(0,0,0,0)にならないよう、
 * 各スロットの「無影響」な中立色でダミーテクスチャを生成する
 */
export const SLOT_DEFAULT_FILL: Record<MToonTextureSlot, readonly [number, number, number, number]> = {
  map: [255, 255, 255, 255], // 乗算なので白=無影響
  shadeMultiplyTexture: [255, 255, 255, 255],
  emissiveMap: [0, 0, 0, 255], // 加算なので黒=発光なし
  normalMap: [128, 128, 255, 255], // フラット法線 (0,0,1)
  shadingShiftTexture: [0, 0, 0, 255],
  matcapTexture: [0, 0, 0, 255],
  rimMultiplyTexture: [255, 255, 255, 255],
  outlineWidthMultiplyTexture: [255, 255, 255, 255],
  uvAnimationMaskTexture: [255, 255, 255, 255], // シェーダーが .b チャンネルを使用、デフォルト1.0=アニメーション有効
}

/**
 * 指定色で塗りつぶされた小さなDataTextureを生成する
 */
export function createSolidColorTexture(
  r: number,
  g: number,
  b: number,
  a: number,
  width = 4,
  height = 4,
): Texture {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  const tex = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  tex.needsUpdate = true
  tex.colorSpace = NoColorSpace
  return tex
}

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
 * 指定スロットについて、各パターンのイメージレイヤーを構築する
 * テクスチャがないマテリアルにはSLOT_DEFAULT_FILLに基づくダミーテクスチャを生成
 *
 * @param materials - 全マテリアル配列
 * @param patternMappings - パターンとマテリアルのマッピング
 * @param patternPlacements - パターンごとのUV変換行列
 * @param slot - 処理対象のテクスチャスロット
 */
export function buildLayersForSlot(
  materials: MToonMaterial[],
  patternMappings: PatternMaterialMapping[],
  patternPlacements: OffsetScale[],
  slot: MToonTextureSlot,
): ImageMatrixPair[] {
  const layers: ImageMatrixPair[] = []

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
    } else {
      // テクスチャを持たないマテリアルにはデフォルト色のダミーテクスチャを生成
      // アトラスの該当領域が黒(0,0,0,0)のまま残ることを防ぐ
      const [r, g, b, a] = SLOT_DEFAULT_FILL[slot]
      layers.push({
        image: createSolidColorTexture(r, g, b, a),
        uvTransform: placement,
      })
    }
  }

  return layers
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
      const layers = buildLayersForSlot(
        materials,
        patternMappings,
        patternPlacements,
        slot,
      )

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
