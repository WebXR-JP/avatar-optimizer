import type { MToonMaterial, VRMExpressionManager } from '@pixiv/three-vrm'
import { Mesh, SkinnedMesh } from 'three'
import type { SimplifyStatistics } from '../process/simplify'
import type { CombinedMeshResult } from './material/types'

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
      // biome-ignore lint/suspicious/noExplicitAny: VRM internal bind types are not exported
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
): CombinedMeshResult {
  return {
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
