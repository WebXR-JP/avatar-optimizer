import type { MToonMaterial, VRMExpressionManager } from '@pixiv/three-vrm'
import { Mesh, type Object3D, SkinnedMesh } from 'three'
import type { SimplifyStatistics } from '../process/simplify'
import type { AtlasSkipped, CombinedMeshResult } from './material/types'

/**
 * 既にアトラス化済みか（MToonAtlasMaterial を含むか）を判定する
 *
 * アトラス化するとマテリアルは MToonAtlasMaterial に置き換わるため、
 * 2 回目以降の実行では MToonMaterial が見つからない。
 * 「元から MToon が無いモデル」と区別するために使う。
 *
 * instanceof を使わないのは、@webxr-jp/mtoon-atlas が
 * 二重インストールされた場合にクラス実体が別になり判定が壊れるため。
 *
 * @param rootNode - 探索の起点
 */
export function hasAtlasedMaterial(rootNode: Object3D): boolean {
  let found = false
  rootNode.traverse((obj) => {
    if (found || !(obj instanceof Mesh)) return
    const materials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material]
    if (materials.some((m) => m && 'isMToonAtlasMaterial' in m)) {
      found = true
    }
  })
  return found
}

/**
 * materialMeshMap から非SkinnedMeshを収集する
 * ボーンペアレントを保持するため、メッシュ統合から除外する必要がある
 */
export function collectNonSkinnedMeshes(
  materialMeshMap: Map<MToonMaterial, Mesh[]>,
): Set<Mesh> {
  const result = new Set<Mesh>()
  for (const meshes of materialMeshMap.values()) {
    for (const mesh of meshes) {
      if (!(mesh instanceof SkinnedMesh)) {
        result.add(mesh)
      }
    }
  }
  return result
}

/**
 * VRM expressionManager から除外メッシュを収集する
 *
 * - MorphTargetBind: primitives からメッシュを収集（常に）
 * - MaterialColorBind / TextureTransformBind: materialMeshMap を使ってメッシュを収集（MToonあり時のみ）
 *
 * @param expressionManager - VRMのexpressionManager（nullの場合は空Setを返す）
 * @param materialMeshMap - MToonMaterial→Mesh[]のマップ（MToonあり時に指定）
 */
export function collectExpressionMeshes(
  expressionManager: VRMExpressionManager | null,
  materialMeshMap?: Map<MToonMaterial, Mesh[]>,
): Set<Mesh> {
  const result = new Set<Mesh>()
  if (!expressionManager) return result

  for (const expression of expressionManager.expressions) {
    for (const bind of expression.binds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- VRM internal bind types are not exported
      const bindAny = bind as any

      // MorphTargetBind
      if (bindAny.primitives) {
        for (const mesh of bindAny.primitives) {
          if (mesh && mesh.isMesh) {
            result.add(mesh)
          }
        }
      }

      // MaterialColorBind / TextureTransformBind（materialMeshMap指定時のみ）
      if (materialMeshMap && bindAny.material) {
        const meshes = materialMeshMap.get(bindAny.material)
        if (meshes) {
          for (const mesh of meshes) {
            result.add(mesh)
          }
        }
      }
    }
  }

  return result
}

/**
 * MToonMaterialがない場合のダミーCombinedMeshResultを生成する
 */
export function createEmptyCombinedMeshResult(
  simplifyStats?: SimplifyStatistics,
  atlasSkipped?: AtlasSkipped,
): CombinedMeshResult {
  return {
    atlasSkipped,
    groups: new Map(),
    materialSlotIndex: new Map(),
    statistics: {
      originalMeshCount: 0,
      originalMaterialCount: 0,
      reducedDrawCalls: 0,
      simplify: simplifyStats,
    },
  }
}
