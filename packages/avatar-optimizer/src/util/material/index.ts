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
export type {
  CombinedMeshResult,
  CombineMaterialOptions,
  MaterialInfo,
  MaterialSlotInfo,
  MeshGroup,
  OutlineWidthMode,
  RenderMode,
} from './types'

/**
 * MToonMaterialのレンダーモードを判定
 * - transparent: true → 'transparent'
 * - alphaTest > 0 → 'alphaTest'
 * - それ以外 → 'opaque'
 */
export function getRenderMode(material: MToonMaterial): import('./types').RenderMode {
  if (material.transparent) return 'transparent'
  if (material.alphaTest > 0) return 'alphaTest'
  return 'opaque'
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
 * @deprecated getMToonMaterialInfoFromObject3Dを使用してください
 */
export function getMToonMaterialsWithMeshesFromObject3D(
  rootNode: Object3D,
): Result<Map<MToonMaterial, Mesh[]>, OptimizationError> {
  const result = getMToonMaterialInfoFromObject3D(rootNode)
  if (result.isErr()) return err(result.error)

  const materialMeshMap = new Map<MToonMaterial, Mesh[]>()
  for (const info of result.value) {
    materialMeshMap.set(info.material, info.meshes)
  }
  return ok(materialMeshMap)
}

/**
 * Three.jsのノードを再帰的に探索してMeshを検索し
 * マテリアル情報（アウトライン情報を含む）のリストを返す
 *
 * @param rootNode 探索を開始するNode
 * @returns マテリアル情報の配列
 */
export function getMToonMaterialInfoFromObject3D(
  rootNode: Object3D,
): Result<import('./types').MaterialInfo[], OptimizationError> {
  const meshes: Mesh[] = []
  rootNode.traverse((obj) => {
    if (obj instanceof Mesh) {
      meshes.push(obj)
    }
  })

  // マテリアルごとの情報を収集
  const materialInfoMap = new Map<MToonMaterial, {
    meshes: Mesh[]
    hasOutline: boolean
    outlineWidthMode: import('./types').OutlineWidthMode
    renderMode: import('./types').RenderMode
  }>()

  for (const mesh of meshes) {
    if (Array.isArray(mesh.material)) {
      // three-vrmで読み込んだモデルのMToonにおいてMaterialが配列になるのはOutlineMeshのみ
      // [0]が通常マテリアル、[1]がアウトライン用マテリアル（isOutline=true）
      if (mesh.material.length === 0) continue
      if (!(mesh.material[0] instanceof MToonMaterial)) continue

      const material = mesh.material[0] as MToonMaterial

      // アウトライン情報を取得
      const hasOutline = material.outlineWidthMode !== 'none'
      const outlineWidthMode = material.outlineWidthMode as import('./types').OutlineWidthMode

      if (!materialInfoMap.has(material)) {
        materialInfoMap.set(material, {
          meshes: [],
          hasOutline,
          outlineWidthMode,
          renderMode: getRenderMode(material),
        })
      }
      materialInfoMap.get(material)!.meshes.push(mesh)
    } else if (mesh.material instanceof MToonMaterial) {
      const material = mesh.material as MToonMaterial

      // アウトライン情報を取得
      const hasOutline = material.outlineWidthMode !== 'none'
      const outlineWidthMode = material.outlineWidthMode as import('./types').OutlineWidthMode

      if (!materialInfoMap.has(material)) {
        materialInfoMap.set(material, {
          meshes: [],
          hasOutline,
          outlineWidthMode,
          renderMode: getRenderMode(material),
        })
      }
      materialInfoMap.get(material)!.meshes.push(mesh)
    }
  }

  if (materialInfoMap.size === 0) {
    return err({
      type: 'ASSET_ERROR',
      message: 'MToonMaterialがありません',
    })
  }

  // MaterialInfo配列に変換
  const result: import('./types').MaterialInfo[] = []
  for (const [material, info] of materialInfoMap) {
    result.push({
      material,
      meshes: info.meshes,
      hasOutline: info.hasOutline,
      outlineWidthMode: info.outlineWidthMode,
      renderMode: info.renderMode,
    })
  }

  return ok(result)
}
