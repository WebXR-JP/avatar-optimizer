/**
 * Core atlas builder
 *
 * マテリアル記述子とテクスチャスロットごとのアトラス画像、
 * そしてマテリアル単位の UV 変換行列を生成する責務を持つ。
 */

import { MToonMaterial } from '@pixiv/three-vrm'
import { err, ok, Result } from 'neverthrow'
import { Mesh, Object3D } from 'three'
import { AtlasImageMap, OptimizationError } from '../../types'

// マテリアル結合のエクスポート
export { combineMToonMaterials } from './combine'
export type { CombinedMeshResult, CombineMaterialOptions } from './types'

/**
 * アトラス化したテクスチャ群をマテリアルにアサインする
 *
 * @param material 対象のマテリアル
 * @param atlasMap
 */
export function assignAtlasTexturesToMaterial(
  material: MToonMaterial,
  atlasMap: AtlasImageMap,
): void {
  if (atlasMap.map) material.map = atlasMap.map
  if (atlasMap.normalMap) material.normalMap = atlasMap.normalMap
  if (atlasMap.emissiveMap) material.emissiveMap = atlasMap.emissiveMap
  if (atlasMap.shadeMultiplyTexture)
    material.shadeMultiplyTexture = atlasMap.shadeMultiplyTexture
  if (atlasMap.shadingShiftTexture)
    material.shadingShiftTexture = atlasMap.shadingShiftTexture
  // MatCapはUV非依存なのでスキップ
  if (atlasMap.rimMultiplyTexture)
    material.rimMultiplyTexture = atlasMap.rimMultiplyTexture
  if (atlasMap.outlineWidthMultiplyTexture)
    material.outlineWidthMultiplyTexture = atlasMap.outlineWidthMultiplyTexture
  if (atlasMap.uvAnimationMaskTexture)
    material.uvAnimationMaskTexture = atlasMap.uvAnimationMaskTexture
}

/**
 * Three.jsのノードを再帰的に探索してMeshを検索し
 * マテリアルとそれに対応するメッシュのMapを返す
 *
 * @param rootNode 探索を開始するNode
 * @returns マテリアルをキー、メッシュの配列を値とするMap
 */
export function getMToonMaterialsWithMeshesFromObject3D(
  rootNode: Object3D,
): Result<Map<MToonMaterial, Mesh[]>, OptimizationError> {
  const meshes: Mesh[] = []
  rootNode.traverse((obj) => {
    if (obj instanceof Mesh) {
      meshes.push(obj)
    }
  })

  const materialMeshMap = new Map<MToonMaterial, Mesh[]>()

  for (const mesh of meshes) {
    if (Array.isArray(mesh.material)) {
      // thee-vrmで読み込んだモデルのMToonにおいてMaterialがArrayになるのはOutlineMeshのみ
      // このとき1番目と2番目のマテリアルパラメータは全く同じなので1番目だけ取る
      if (mesh.material.length === 0) continue
      if (!(mesh.material[0] instanceof MToonMaterial)) continue
      const material = mesh.material[0] as MToonMaterial
      if (!materialMeshMap.has(material)) {
        materialMeshMap.set(material, [])
      }
      materialMeshMap.get(material)!.push(mesh)
    } else if (mesh.material instanceof MToonMaterial) {
      const material = mesh.material as MToonMaterial
      if (!materialMeshMap.has(material)) {
        materialMeshMap.set(material, [])
      }
      materialMeshMap.get(material)!.push(mesh)
    }
  }

  if (materialMeshMap.size === 0) {
    return err({
      type: 'ASSET_ERROR',
      message: 'MToonMaterialがありません',
    })
  }

  return ok(materialMeshMap)
}
