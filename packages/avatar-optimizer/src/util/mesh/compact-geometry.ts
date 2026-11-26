import {
  BufferAttribute,
  BufferGeometry,
  InterleavedBufferAttribute,
  TypedArray,
} from 'three'

/**
 * ジオメトリコンパクションのオプション
 */
export interface CompactGeometryOptions {
  /** morphAttributes を保持するか（既定: true） */
  preserveMorphAttributes?: boolean
}

/**
 * TypedArray のコンストラクタを使って空配列を作成し、指定インデックスの要素を詰めてコピーする。
 *
 * `BufferAttribute.getComponent` は `normalized: true` の整数属性を [0, 1] に正規化して返すため、
 * Uint8/Uint16 配列へ書き戻すと値が 0/1 に潰れてしまう。生のバッファ配列から直接要素をコピーすることで
 * 正規化フラグと元の整数値を維持する。
 */
function remapBufferAttribute(
  attr: BufferAttribute | InterleavedBufferAttribute,
  newToOld: Uint32Array,
): BufferAttribute {
  const newCount = newToOld.length
  const itemSize = attr.itemSize
  const normalized = attr.normalized

  const isInterleaved = attr instanceof InterleavedBufferAttribute
  const srcArray = isInterleaved ? attr.data.array : attr.array
  const TypedArrayCtor = srcArray.constructor as new (
    length: number,
  ) => TypedArray
  const newArray = new TypedArrayCtor(newCount * itemSize)

  if (isInterleaved) {
    const stride = attr.data.stride
    const offset = attr.offset
    for (let newIdx = 0; newIdx < newCount; newIdx++) {
      const oldBase = newToOld[newIdx] * stride + offset
      const newBase = newIdx * itemSize
      for (let j = 0; j < itemSize; j++) {
        newArray[newBase + j] = srcArray[oldBase + j]
      }
    }
  } else {
    for (let newIdx = 0; newIdx < newCount; newIdx++) {
      const oldBase = newToOld[newIdx] * itemSize
      const newBase = newIdx * itemSize
      for (let j = 0; j < itemSize; j++) {
        newArray[newBase + j] = srcArray[oldBase + j]
      }
    }
  }

  return new BufferAttribute(newArray, itemSize, normalized)
}

/**
 * インデックスから参照されていない頂点を除去し、属性配列をコンパクションした新しい BufferGeometry を返す。
 *
 * UniVRM 0.x / VRoid Studio 出力モデルのように、同一 glTF mesh 内の複数プリミティブが
 * 共有の POSITION バッファを持ち、indices だけで描画範囲を分けている場合、
 * そのまま mergeGeometries すると未使用頂点がプリミティブ数倍に増殖するのを防ぐ。
 *
 * @param geometry - 対象のジオメトリ（元のインスタンスは変更しない）
 * @param options - コンパクションオプション
 * @returns コンパクション済みの新しい BufferGeometry
 */
export function compactIndexedGeometry(
  geometry: BufferGeometry,
  options: CompactGeometryOptions = {},
): BufferGeometry {
  const preserveMorphAttributes = options.preserveMorphAttributes !== false
  const positionAttr = geometry.getAttribute('position')
  const indexAttr = geometry.index

  if (!positionAttr || !indexAttr) {
    return cloneWithMorphOption(geometry, preserveMorphAttributes)
  }

  const vertexCount = positionAttr.count
  const indexCount = indexAttr.count

  if (vertexCount === 0) {
    return cloneWithMorphOption(geometry, preserveMorphAttributes)
  }

  if (indexCount === 0) {
    return createEmptyCompactedGeometry(geometry, preserveMorphAttributes)
  }

  // 参照されている頂点をマーク（O(indexCount + vertexCount)）
  const usedFlags = new Uint8Array(vertexCount)
  let usedCount = 0

  for (let i = 0; i < indexCount; i++) {
    const vIdx = indexAttr.getX(i)
    if (!Number.isInteger(vIdx) || vIdx < 0 || vIdx >= vertexCount) {
      // 不正なインデックスが含まれる場合は安全にフォールバック
      return cloneWithMorphOption(geometry, preserveMorphAttributes)
    }
    if (usedFlags[vIdx] === 0) {
      usedFlags[vIdx] = 1
      usedCount++
    }
  }

  // 全頂点が使用されている場合でも、InterleavedBufferAttribute を含む場合は
  // 後続のマージ処理に備えて通常の BufferAttribute へ展開しない場合のみ clone を返す。
  // 未使用頂点がないときは clone で十分。
  if (usedCount === vertexCount) {
    return cloneWithMorphOption(geometry, preserveMorphAttributes)
  }

  // 元の頂点順を保ったまま旧→新・新→旧の対応表を構築
  const oldToNew = new Int32Array(vertexCount).fill(-1)
  const newToOld = new Uint32Array(usedCount)
  let nextNewIdx = 0
  for (let oldIdx = 0; oldIdx < vertexCount; oldIdx++) {
    if (usedFlags[oldIdx] === 1) {
      oldToNew[oldIdx] = nextNewIdx
      newToOld[nextNewIdx] = oldIdx
      nextNewIdx++
    }
  }

  const newGeometry = new BufferGeometry()
  newGeometry.name = geometry.name
  newGeometry.userData = { ...geometry.userData }

  // 65535 頂点以下なら最大インデックスは 65534 以下のため Uint16Array に収まる
  const IndexArrayCtor = usedCount <= 65535 ? Uint16Array : Uint32Array
  const remappedIndices = new IndexArrayCtor(indexCount)
  for (let i = 0; i < indexCount; i++) {
    remappedIndices[i] = oldToNew[indexAttr.getX(i)]
  }
  newGeometry.setIndex(new BufferAttribute(remappedIndices, 1))

  for (const name of Object.keys(geometry.attributes)) {
    const attr = geometry.getAttribute(name)
    if (attr) {
      newGeometry.setAttribute(name, remapBufferAttribute(attr, newToOld))
    }
  }

  applyMorphAttributes(geometry, newGeometry, newToOld, preserveMorphAttributes)

  for (const group of geometry.groups) {
    newGeometry.addGroup(group.start, group.count, group.materialIndex)
  }
  newGeometry.setDrawRange(geometry.drawRange.start, geometry.drawRange.count)

  return newGeometry
}

function applyMorphAttributes(
  source: BufferGeometry,
  target: BufferGeometry,
  newToOld: Uint32Array,
  preserveMorphAttributes: boolean,
): void {
  if (!preserveMorphAttributes) {
    target.morphAttributes = {}
    target.morphTargetsRelative = false
    return
  }

  target.morphTargetsRelative = source.morphTargetsRelative
  for (const morphName of Object.keys(source.morphAttributes) as Array<
    keyof typeof source.morphAttributes
  >) {
    const morphList = source.morphAttributes[morphName]
    if (morphList && morphList.length > 0) {
      target.morphAttributes[morphName] = morphList.map((attr) =>
        remapBufferAttribute(attr, newToOld),
      )
    }
  }
}

function cloneWithMorphOption(
  geometry: BufferGeometry,
  preserveMorphAttributes: boolean,
): BufferGeometry {
  const cloned = geometry.clone()
  if (!preserveMorphAttributes) {
    cloned.morphAttributes = {}
    cloned.morphTargetsRelative = false
  }
  return cloned
}

function createEmptyCompactedGeometry(
  geometry: BufferGeometry,
  preserveMorphAttributes: boolean,
): BufferGeometry {
  const emptyGeometry = new BufferGeometry()
  emptyGeometry.name = geometry.name
  emptyGeometry.userData = { ...geometry.userData }
  emptyGeometry.setIndex(new BufferAttribute(new Uint16Array(0), 1))

  const emptyMap = new Uint32Array(0)
  for (const name of Object.keys(geometry.attributes)) {
    const attr = geometry.getAttribute(name)
    if (attr) {
      emptyGeometry.setAttribute(name, remapBufferAttribute(attr, emptyMap))
    }
  }

  applyMorphAttributes(
    geometry,
    emptyGeometry,
    emptyMap,
    preserveMorphAttributes,
  )

  return emptyGeometry
}
