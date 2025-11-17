/**
 * Core atlas builder
 *
 * マテリアル記述子とテクスチャスロットごとのアトラス画像、
 * そしてマテリアル単位の UV 変換行列を生成する責務を持つ。
 */

import { MToonNodeMaterial } from '@pixiv/three-vrm-materials-mtoon/nodes'
import { AtlasImageMap, AtlasTextureDescriptor, MTOON_TEXTURE_SLOTS, MToonTextureSlot, PatternMaterialMapping, TextureCombinationPattern, ThreeImageType } from '../types';
import { MToonMaterial } from '@pixiv/three-vrm';
import { Texture } from 'three';

// マテリアル結合のエクスポート
export { combineMToonMaterials, createParameterTexture } from './combine'
export type { CombineMaterialOptions, CombinedMeshResult, CombineError } from './types'

/** Textureがサイズ情報を持っているか判定するヘルパー関数 */
function hasSize(
  img: any
): img is { width: number; height: number }
{
  return img && typeof img.width === 'number' && typeof img.height === 'number';
}

/**
 * アトラス化したテクスチャ群をマテリアルにアサインする
 *
 * @param material 対象のマテリアル
 * @param atlasMap
 */
export function assignAtlasTexturesToMaterial(
  material: MToonMaterial,
  atlasMap: AtlasImageMap,
): void
{
  if (atlasMap.map) material.map = atlasMap.map
  if (atlasMap.normalMap) material.normalMap = atlasMap.normalMap
  if (atlasMap.emissiveMap) material.emissiveMap = atlasMap.emissiveMap
  if (atlasMap.shadeMultiplyTexture) material.shadeMultiplyTexture = atlasMap.shadeMultiplyTexture
  if (atlasMap.shadingShiftTexture) material.shadingShiftTexture = atlasMap.shadingShiftTexture
  // MatCapはUV非依存なのでスキップ
  if (atlasMap.rimMultiplyTexture) material.rimMultiplyTexture = atlasMap.rimMultiplyTexture
  if (atlasMap.outlineWidthMultiplyTexture) material.outlineWidthMultiplyTexture = atlasMap.outlineWidthMultiplyTexture
  if (atlasMap.uvAnimationMaskTexture) material.uvAnimationMaskTexture = atlasMap.uvAnimationMaskTexture
}

/**
 * マテリアルからテクスチャ組み合わせパターンを抽出
 *
 * @param material - MToonMaterial
 * @returns テクスチャ組み合わせパターン
 */
function extractTexturePattern(material: MToonMaterial): TextureCombinationPattern
{
  const slots = new Map<MToonTextureSlot, ThreeImageType | null>()

  for (const slot of MTOON_TEXTURE_SLOTS)
  {
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
  pattern2: TextureCombinationPattern
): boolean
{
  for (const slot of MTOON_TEXTURE_SLOTS)
  {
    const img1 = pattern1.slots.get(slot) ?? null
    const img2 = pattern2.slots.get(slot) ?? null

    // imageオブジェクトの参照が異なる場合はfalse
    if (img1 !== img2) return false
  }

  return true
}

/**
 * マテリアル配列から一意なテクスチャ組み合わせパターンを抽出し、
 * 各パターンを使用するマテリアルのインデックスをマッピング
 *
 * @param materials - MToonNodeMaterial配列
 * @returns パターンとマテリアルのマッピング配列
 */
export function buildPatternMaterialMappings(
  materials: MToonMaterial[]
): PatternMaterialMapping[]
{
  const mappings: PatternMaterialMapping[] = []

  for (let i = 0; i < materials.length; i++)
  {
    const material = materials[i]
    const pattern = extractTexturePattern(material)

    // 既存のパターンと一致するか確認
    const existingMapping = mappings.find(m => isSamePattern(m.pattern, pattern))

    if (existingMapping)
    {
      // 既存パターンにマテリアルインデックスを追加
      existingMapping.materialIndices.push(i)
    }
    else
    {
      // 新しいパターンとして追加
      // テクスチャディスクリプタはmapスロットから取得（nullの場合は後で平均値で埋める）
      const mapTexture = material.map
      const textureDescriptor: AtlasTextureDescriptor = (mapTexture && hasSize(mapTexture.image))
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
