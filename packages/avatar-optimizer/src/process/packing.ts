import { MToonMaterial } from '@pixiv/three-vrm'
import { fromSafePromise, ResultAsync } from 'neverthrow'
import { Texture } from 'three'
import {
  AtlasTextureDescriptor,
  MTOON_TEXTURE_SLOTS,
  MToonTextureSlot,
  OptimizationError,
  PatternMaterialMapping,
  TextureCombinationPattern,
  ThreeImageType,
} from '../types'
import { PackingLayouts } from '../util/material/types'
import { fillNullTexturesWithAverageDimensions } from '../util/texture'
import { packTextures } from '../util/texture/packing'

/**
 * 渡されたマテリアルリストからメインテクスチャの解像度一覧を取得し
 * その結果をもとにテクスチャパッキングの配置情報を生成する
 *
 * @param materials 1枚にパッキングするマテリアルのリスト
 * @params atlasSize 各アトラステクスチャの一辺の解像度 (現在は正方形固定)
 * @returns アトラステクスチャを生成するためのレイアウト情報
 */
export function pack(
  patternMappings: PatternMaterialMapping[],
): ResultAsync<PackingLayouts, OptimizationError> {
  return fromSafePromise(
    (async () => {
      // パターンごとのテクスチャディスクリプタを収集
      const textureDescriptors = patternMappings.map((m) => m.textureDescriptor)

      // width/heightが0のものを有効なテクスチャの平均値で埋める
      const texturesToPack = fillNullTexturesWithAverageDimensions(
        textureDescriptors.map((d) => (d.width > 0 && d.height > 0 ? d : null)),
      )

      // テクスチャパッキングを実行（パターン数分）
      return await packTextures(texturesToPack)
    })(),
  )
}

/**
 * マテリアル配列から一意なテクスチャ組み合わせパターンを抽出し、
 * 各パターンを使用するマテリアルのインデックスをマッピング
 *
 * @param materials - MToonNodeMaterial配列
 * @returns パターンとマテリアルのマッピング配列
 */
export function buildPatternMaterialMappings(
  materials: MToonMaterial[],
): PatternMaterialMapping[] {
  const mappings: PatternMaterialMapping[] = []

  for (let i = 0; i < materials.length; i++) {
    const material = materials[i]
    const pattern = extractTexturePattern(material)

    // 既存のパターンと一致するか確認
    const existingMapping = mappings.find((m) =>
      isSamePattern(m.pattern, pattern),
    )

    if (existingMapping) {
      // 既存パターンにマテリアルインデックスを追加
      existingMapping.materialIndices.push(i)
    } else {
      // 新しいパターンとして追加
      // テクスチャディスクリプタはmapスロットから取得（nullの場合は後で平均値で埋める）
      const mapTexture = material.map
      const textureDescriptor: AtlasTextureDescriptor =
        mapTexture && hasSize(mapTexture.image)
          ? {
            width: mapTexture.image.width,
            height: mapTexture.image.height,
          }
          : {
            width: 0,
            height: 0,
          }

      mappings.push({
        pattern,
        materialIndices: [i],
        textureDescriptor,
      })
    }
  }

  return mappings
}

/**
 * マテリアルからテクスチャ組み合わせパターンを抽出
 *
 * @param material - MToonMaterial
 * @returns テクスチャ組み合わせパターン
 */
export function extractTexturePattern(
  material: MToonMaterial,
): TextureCombinationPattern {
  const slots = new Map<MToonTextureSlot, ThreeImageType | null>()

  for (const slot of MTOON_TEXTURE_SLOTS) {
    const texture = material[slot] as Texture<ThreeImageType>
    // テクスチャのimageオブジェクトを保持（nullの場合はnull）
    slots.set(slot, texture?.image ?? null)
  }

  return { slots }
}

/**
 * 2つのテクスチャ組み合わせパターンが同じか判定
 * 各スロットのimageオブジェクトの同一性で判定
 *
 * @param pattern1 - パターン1
 * @param pattern2 - パターン2
 * @returns 同じパターンの場合true
 */
function isSamePattern(
  pattern1: TextureCombinationPattern,
  pattern2: TextureCombinationPattern,
): boolean {
  for (const slot of MTOON_TEXTURE_SLOTS) {
    const img1 = pattern1.slots.get(slot) ?? null
    const img2 = pattern2.slots.get(slot) ?? null

    // imageオブジェクトの参照が異なる場合はfalse
    if (img1 !== img2) return false
  }

  return true
}

/** Textureがサイズ情報を持っているか判定するヘルパー関数 */
function hasSize<T>(img: T): img is T & { width: number; height: number } {
  return (
    img != null &&
    typeof (img as Record<string, unknown>).width === 'number' &&
    typeof (img as Record<string, unknown>).height === 'number'
  )
}
