import { err, ok, Result } from 'neverthrow'
import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OptimizationError } from '../../types'

/**
 * ジオメトリを結合してスロット属性を追加
 *
 * BufferGeometryUtils.mergeBufferGeometriesを使用して複数のジオメトリを
 * マージし、スロット属性を追加します。スキニング情報は一旦捨てて
 * 通常のMeshとして結合します。
 * TODO: SkinnedMeshの完全対応
 *
 * @param meshes - 結合対象のメッシュ配列
 * @param materialSlotMap - メッシュ→スロットインデックスのマップ
 * @param slotAttributeName - スロット属性名
 * @returns 結合されたBufferGeometryの配列
 */
export function mergeGeometriesWithSlotAttribute(
  meshes: Mesh[],
  materialSlotMap: Map<Mesh, number>,
  slotAttributeName: string,
): Result<BufferGeometry[], OptimizationError> {
  if (meshes.length === 0) {
    return err({
      type: 'ASSET_ERROR',
      message: 'マージ対象のメッシュがありません',
    })
  }

  // 有効なジオメトリを持つメッシュをフィルタリング
  const validMeshes: Array<{ mesh: Mesh; geometry: BufferGeometry }> = []
  for (const mesh of meshes) {
    if (mesh.geometry instanceof BufferGeometry) {
      const vertexCount = mesh.geometry.attributes.position?.count ?? 0
      if (vertexCount > 0) {
        validMeshes.push({ mesh, geometry: mesh.geometry })
      }
    }
  }

  if (validMeshes.length === 0) {
    return err({
      type: 'ASSET_ERROR',
      message: '有効なジオメトリを持つメッシュがありません',
    })
  }

  // 各ジオメトリをワールド座標に変換
  const transformedGeometries: BufferGeometry[] = []
  const slotData: number[] = []

  for (const { mesh, geometry } of validMeshes) {
    const transformedGeometry = geometry.clone()
    const vertexCount = geometry.attributes.position?.count ?? 0

    // TODO: 顔メッシュを判別して、顔メッシュの場合はモーフターゲットを残す
    // 現状は全てのメッシュからモーフターゲットを削除
    transformedGeometry.morphAttributes = {}
    transformedGeometry.morphTargetsRelative = false

    transformedGeometries.push(transformedGeometry)

    // スロットインデックスを頂点数分追加
    const slotIndex = materialSlotMap.get(mesh) ?? 0
    for (let i = 0; i < vertexCount; i++) {
      slotData.push(slotIndex)
    }
  }

  // BufferGeometryUtils.mergeBufferGeometriesを使用してジオメトリをマージ
  const mergedGeometry = mergeGeometries(transformedGeometries)

  // スロット属性を追加
  const slotArray = new Float32Array(slotData)
  mergedGeometry.setAttribute(
    slotAttributeName,
    new Float32BufferAttribute(slotArray, 1),
  )

  return ok([mergedGeometry])
}
