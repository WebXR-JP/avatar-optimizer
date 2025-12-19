/**
 * VRM モデルのメッシュ簡略化処理
 *
 * excludedMeshes（表情メッシュ）を除外し、
 * 残りのメッシュに対してmeshoptimizerによる頂点削減を適用
 */

import { ResultAsync } from 'neverthrow'
import { Mesh, Object3D, SkinnedMesh } from 'three'
import { OptimizationError, SimplifyOptions } from '../types'
import { ensureSimplifierReady, simplifyGeometry } from '../util/mesh/simplify-mesh'

/**
 * 簡略化結果の統計情報
 */
export interface SimplifyStatistics {
  /** 処理したメッシュ数 */
  processedMeshCount: number
  /** スキップしたメッシュ数（表情メッシュ、MorphTarget持ち等） */
  skippedMeshCount: number
  /** 削減前の総頂点数 */
  originalVertexCount: number
  /** 削減後の総頂点数 */
  simplifiedVertexCount: number
  /** 削減前の総インデックス数 */
  originalIndexCount: number
  /** 削減後の総インデックス数 */
  simplifiedIndexCount: number
  /** 頂点削減率 */
  vertexReductionRatio: number
  /** インデックス削減率 */
  indexReductionRatio: number
}

/**
 * ルートノード配下のメッシュを簡略化
 *
 * @param rootNode - 処理対象のルートノード
 * @param excludedMeshes - 簡略化から除外するメッシュのSet
 * @param options - 簡略化オプション
 * @returns 簡略化統計情報
 */
export function simplifyMeshes(
  rootNode: Object3D,
  excludedMeshes: Set<Mesh>,
  options: SimplifyOptions = {},
): ResultAsync<SimplifyStatistics, OptimizationError> {
  return ResultAsync.fromSafePromise(
    simplifyMeshesAsync(rootNode, excludedMeshes, options),
  )
}

async function simplifyMeshesAsync(
  rootNode: Object3D,
  excludedMeshes: Set<Mesh>,
  options: SimplifyOptions,
): Promise<SimplifyStatistics> {
  // meshoptimizer の初期化を待機
  await ensureSimplifierReady()

  const stats: SimplifyStatistics = {
    processedMeshCount: 0,
    skippedMeshCount: 0,
    originalVertexCount: 0,
    simplifiedVertexCount: 0,
    originalIndexCount: 0,
    simplifiedIndexCount: 0,
    vertexReductionRatio: 0,
    indexReductionRatio: 0,
  }

  const opts: SimplifyOptions = {
    morphTargetHandling: 'skip',
    ...options,
  }

  // メッシュを収集
  const meshesToProcess: Mesh[] = []
  rootNode.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    if (excludedMeshes.has(obj)) {
      stats.skippedMeshCount++
      return
    }

    // MorphTargetを持つメッシュの処理
    if (
      obj.geometry.morphAttributes &&
      Object.keys(obj.geometry.morphAttributes).length > 0
    ) {
      if (opts.morphTargetHandling === 'skip') {
        // eslint-disable-next-line no-console
        console.warn(`MorphTargetを持つメッシュをスキップしました: ${obj.name}`)
        stats.skippedMeshCount++
        return
      }
      // 'discard' の場合は続行（simplifyGeometry内でmorphAttributesは処理されない）
    }

    meshesToProcess.push(obj)
  })

  // 各メッシュを簡略化
  for (const mesh of meshesToProcess) {
    const originalVertexCount = mesh.geometry.getAttribute('position')?.count ?? 0
    const originalIndexCount = mesh.geometry.index?.count ?? originalVertexCount
    stats.originalVertexCount += originalVertexCount
    stats.originalIndexCount += originalIndexCount

    const result = simplifyGeometry(mesh.geometry, options)

    if (result.isErr()) {
      // eslint-disable-next-line no-console
      console.warn(
        `メッシュの簡略化に失敗しました (${mesh.name}): ${result.error.message}`,
      )
      stats.skippedMeshCount++
      stats.originalVertexCount -= originalVertexCount
      stats.originalIndexCount -= originalIndexCount
      continue
    }

    // ジオメトリを置き換え
    const oldGeometry = mesh.geometry
    mesh.geometry = result.value

    // 全ての属性バッファを更新フラグをセット（WebGLキャッシュ対策）
    for (const key of Object.keys(mesh.geometry.attributes)) {
      const attr = mesh.geometry.attributes[key]
      if (attr) {
        attr.needsUpdate = true
      }
    }
    if (mesh.geometry.index) {
      mesh.geometry.index.needsUpdate = true
    }

    // SkinnedMeshの場合、バインドマトリックスを再計算
    if (mesh instanceof SkinnedMesh) {
      // バインドマトリックスを再適用（スケルトンとの関連付けを維持）
      if (mesh.skeleton) {
        mesh.bind(mesh.skeleton, mesh.bindMatrix)
      }
    }

    // 古いジオメトリを破棄
    oldGeometry.dispose()

    const newVertexCount = mesh.geometry.getAttribute('position')?.count ?? 0
    const newIndexCount = mesh.geometry.index?.count ?? newVertexCount
    stats.simplifiedVertexCount += newVertexCount
    stats.simplifiedIndexCount += newIndexCount
    stats.processedMeshCount++
  }

  // 削減率を計算
  if (stats.originalVertexCount > 0) {
    stats.vertexReductionRatio =
      1 - stats.simplifiedVertexCount / stats.originalVertexCount
  }
  if (stats.originalIndexCount > 0) {
    stats.indexReductionRatio =
      1 - stats.simplifiedIndexCount / stats.originalIndexCount
  }

  return stats
}
