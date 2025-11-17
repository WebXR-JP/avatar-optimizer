/**
 * Core atlas builder
 *
 * マテリアル記述子とテクスチャスロットごとのアトラス画像、
 * そしてマテリアル単位の UV 変換行列を生成する責務を持つ。
 */

import { MToonNodeMaterial } from '@pixiv/three-vrm-materials-mtoon/nodes'
import { AtlasImageMap, AtlasTextureDescriptor, MTOON_TEXTURE_SLOTS, MToonTextureSlot, OptimizationError, PatternMaterialMapping, TextureCombinationPattern, ThreeImageType } from '../../types';
import { MToonMaterial } from '@pixiv/three-vrm';
import { Mesh, Object3D, Texture } from 'three';
import { err, ok, Result } from 'neverthrow';

// マテリアル結合のエクスポート
export { combineMToonMaterials } from './combine'
export type { CombineMaterialOptions, CombinedMeshResult } from './types'



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
 * Three.jsのノードを再帰的に探索してMeshを検索し
 * マテリアルを収集して返す (重複なし)
 *
 * @param rootNode 探索を開始するNode
 * @returns 発見した全てのマテリアル
 */
export function getMToonMaterialsFromObject3D(rootNode: Object3D): Result<MToonMaterial[], OptimizationError>
{
  const meshes: Mesh[] = []
  rootNode.traverse(obj =>
  {
    if (obj instanceof Mesh)
    {
      meshes.push(obj)
    }
  })

  let materials: MToonMaterial[] = []
  for (const mesh of meshes)
  {
    if (Array.isArray(mesh.material))
    {
      materials.push(...(mesh.material.filter((m) => m instanceof MToonMaterial) as MToonMaterial[]))
    } else if (mesh.material instanceof MToonMaterial)
    {
      materials.push(mesh.material as MToonMaterial)
    }
  }

  materials = Array.from(new Set(materials)) // 重複排除
  if (materials.length === 0)
  {
    return err({
      type: 'ASSET_ERROR',
      message: 'MToonMaterial not found.',
    })
  }

  return ok(materials)
}
