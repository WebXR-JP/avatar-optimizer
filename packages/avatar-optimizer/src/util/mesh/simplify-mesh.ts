/**
 * メッシュ簡略化ユーティリティ
 *
 * meshoptimizer のsimplifyWithAttributesを使用して
 * BufferGeometryの頂点数を削減する
 */

import { MeshoptSimplifier } from 'meshoptimizer'
import { err, ok, Result, safeTry } from 'neverthrow'
import { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three'
import { OptimizationError, SimplifyOptions } from '../../types'

/** デフォルト設定 */
const DEFAULT_SIMPLIFY_OPTIONS: Required<SimplifyOptions> = {
  targetRatio: 0.5,
  targetError: 0.01,
  lockBorder: true,
  uvWeight: 1.0,
  normalWeight: 0.5,
  morphTargetHandling: 'skip',
}

/**
 * meshoptimizer の初期化を待機
 */
export async function ensureSimplifierReady(): Promise<void> {
  await MeshoptSimplifier.ready
}

/**
 * 属性データを連続した Float32Array に変換
 */
function extractAttributeData(
  attr: BufferAttribute | InterleavedBufferAttribute,
): Float32Array {
  const count = attr.count
  const itemSize = attr.itemSize
  const result = new Float32Array(count * itemSize)

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < itemSize; j++) {
      result[i * itemSize + j] = attr.getComponent(i, j)
    }
  }

  return result
}

/**
 * 単一のBufferGeometryを簡略化
 *
 * @param geometry - 簡略化対象のジオメトリ
 * @param options - 簡略化オプション
 * @returns 簡略化されたジオメトリ（新しいインスタンス）
 */
export function simplifyGeometry(
  geometry: BufferGeometry,
  options: SimplifyOptions = {},
): Result<BufferGeometry, OptimizationError> {
  return safeTry(function* () {
    const opts = { ...DEFAULT_SIMPLIFY_OPTIONS, ...options }

    // 位置属性の取得
    const positionAttr = geometry.getAttribute('position')
    if (!positionAttr) {
      return err({
        type: 'ASSET_ERROR' as const,
        message: 'position属性が存在しません',
      })
    }

    const vertexCount = positionAttr.count

    // インデックスの取得または生成
    let indices: Uint32Array
    if (geometry.index) {
      indices = new Uint32Array(geometry.index.array)
    } else {
      // 非インデックスジオメトリの場合はインデックスを生成
      indices = new Uint32Array(vertexCount)
      for (let i = 0; i < vertexCount; i++) {
        indices[i] = i
      }
    }

    // 位置データの準備
    const positions = extractAttributeData(positionAttr)

    // 属性データの収集（法線、UV）
    const uvAttr = geometry.getAttribute('uv')
    const normalAttr = geometry.getAttribute('normal')

    // simplifyWithAttributes用のデータ準備
    // 属性は頂点ごとに連続して配置される必要がある
    const attributeComponents: number[] = []
    const attributeWeights: number[] = []

    // 法線を追加（xyz: 3成分）
    if (normalAttr) {
      attributeComponents.push(3)
      for (let i = 0; i < 3; i++) {
        attributeWeights.push(opts.normalWeight)
      }
    }

    // UVを追加（uv: 2成分）
    if (uvAttr) {
      attributeComponents.push(2)
      for (let i = 0; i < 2; i++) {
        attributeWeights.push(opts.uvWeight)
      }
    }

    // 目標インデックス数の計算
    const targetIndexCount = Math.max(3, Math.floor(indices.length * opts.targetRatio))

    // フラグの設定
    const flags: ('LockBorder' | 'Sparse' | 'ErrorAbsolute')[] = []
    if (opts.lockBorder) {
      flags.push('LockBorder')
    }

    // 簡略化の実行
    let newIndices: Uint32Array
    let resultError: number

    if (attributeWeights.length > 0) {
      // 属性を頂点ごとに連結
      const stride = attributeWeights.length
      const attributes = new Float32Array(vertexCount * stride)

      for (let v = 0; v < vertexCount; v++) {
        let offset = 0

        // 法線
        if (normalAttr) {
          for (let j = 0; j < 3; j++) {
            attributes[v * stride + offset + j] = normalAttr.getComponent(v, j)
          }
          offset += 3
        }

        // UV
        if (uvAttr) {
          for (let j = 0; j < 2; j++) {
            attributes[v * stride + offset + j] = uvAttr.getComponent(v, j)
          }
        }
      }

      ;[newIndices, resultError] = MeshoptSimplifier.simplifyWithAttributes(
        indices,
        positions,
        3, // position stride
        attributes,
        stride,
        attributeWeights,
        null, // vertex_lock
        targetIndexCount,
        opts.targetError,
        flags,
      )
    } else {
      ;[newIndices, resultError] = MeshoptSimplifier.simplify(
        indices,
        positions,
        3,
        targetIndexCount,
        opts.targetError,
        flags,
      )
    }

    // 簡略化が実質的に行われなかった場合
    if (newIndices.length === indices.length) {
      // 元のジオメトリのクローンを返す
      return ok(geometry.clone())
    }

    // 新しいジオメトリの構築（使用される頂点のみを含む）
    const newGeometry = yield* rebuildGeometry(geometry, newIndices)

    // 簡略化エラー値をuserDataに保存
    newGeometry.userData.simplifyError = resultError

    return ok(newGeometry)
  })
}

/**
 * 新しいインデックスに基づいてジオメトリを再構築
 * 未使用の頂点を削除し、属性を再マッピング
 */
function rebuildGeometry(
  originalGeometry: BufferGeometry,
  newIndices: Uint32Array,
): Result<BufferGeometry, OptimizationError> {
  return safeTry(function* () {
    // 使用される頂点インデックスを収集
    const usedVertices = new Set<number>()
    for (let i = 0; i < newIndices.length; i++) {
      usedVertices.add(newIndices[i])
    }

    // 旧インデックス→新インデックスのマッピングを作成
    const vertexRemap = new Map<number, number>()
    const sortedIndices = Array.from(usedVertices).sort((a, b) => a - b)
    let newIndex = 0
    for (const oldIndex of sortedIndices) {
      vertexRemap.set(oldIndex, newIndex++)
    }

    const newVertexCount = vertexRemap.size

    // 新しいジオメトリを作成
    const newGeometry = new BufferGeometry()

    // インデックスをリマップ
    const remappedIndices = new Uint32Array(newIndices.length)
    for (let i = 0; i < newIndices.length; i++) {
      const remapped = vertexRemap.get(newIndices[i])
      if (remapped === undefined) {
        return err({
          type: 'INTERNAL_ERROR' as const,
          message: `頂点インデックスのリマップに失敗しました: ${newIndices[i]}`,
        })
      }
      remappedIndices[i] = remapped
    }
    newGeometry.setIndex(new BufferAttribute(remappedIndices, 1))

    // 各属性をリマップ
    for (const name of Object.keys(originalGeometry.attributes)) {
      const attr = originalGeometry.getAttribute(name)
      const itemSize = attr.itemSize
      const normalized = attr.normalized

      // 属性の型を判定
      let TypedArrayConstructor: Float32ArrayConstructor | Uint16ArrayConstructor | Uint8ArrayConstructor
      if (name === 'skinIndex') {
        // skinIndexはUint16Array
        TypedArrayConstructor = Uint16Array
      } else if (attr.array instanceof Uint8Array) {
        TypedArrayConstructor = Uint8Array
      } else {
        TypedArrayConstructor = Float32Array
      }

      const newArray = new TypedArrayConstructor(newVertexCount * itemSize)

      for (const [oldIdx, newIdx] of vertexRemap) {
        for (let j = 0; j < itemSize; j++) {
          newArray[newIdx * itemSize + j] = attr.array[oldIdx * itemSize + j]
        }
      }

      const newAttr = new BufferAttribute(newArray, itemSize, normalized)
      newGeometry.setAttribute(name, newAttr)
    }

    // バウンディングボックス/スフィアを再計算
    newGeometry.computeBoundingBox()
    newGeometry.computeBoundingSphere()

    return ok(newGeometry)
  })
}
