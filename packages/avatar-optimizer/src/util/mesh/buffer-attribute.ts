/**
 * BufferAttribute の安全な編集ユーティリティ
 *
 * SharedArrayBuffer や InterleavedBufferAttribute を考慮し、
 * 元のバッファを変更せず新しい BufferAttribute を返す。
 */

import {
  BufferAttribute,
  InterleavedBufferAttribute,
  TypedArray,
} from 'three'

/**
 * BufferAttribute または InterleavedBufferAttribute から
 * 独立した新しい BufferAttribute を作成する
 *
 * - InterleavedBufferAttribute: データを抽出して通常の BufferAttribute に変換
 * - 通常の BufferAttribute: 配列をコピーして新しい BufferAttribute を作成
 *
 * @param attr - コピー元の属性
 * @returns 新しい独立した BufferAttribute
 */
export function cloneBufferAttribute(
  attr: BufferAttribute | InterleavedBufferAttribute,
): BufferAttribute {
  const count = attr.count
  const itemSize = attr.itemSize
  const normalized = attr.normalized

  // 元の配列の型を判定して同じ型の配列を作成
  const TypedArrayConstructor = attr.array.constructor as new (
    length: number,
  ) => TypedArray
  const newArray = new TypedArrayConstructor(count * itemSize)

  // InterleavedBufferAttribute の場合は getComponent でデータを抽出
  // 通常の BufferAttribute でも同じ処理で動作する
  if (attr instanceof InterleavedBufferAttribute) {
    // InterleavedBufferAttribute: ストライドを考慮してデータを抽出
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < itemSize; j++) {
        newArray[i * itemSize + j] = attr.getComponent(i, j)
      }
    }
  } else {
    // 通常の BufferAttribute: 配列を直接コピー
    // slice() を使用して SharedArrayBuffer からも安全にコピー
    const sourceArray = attr.array
    for (let i = 0; i < sourceArray.length; i++) {
      newArray[i] = sourceArray[i]
    }
  }

  return new BufferAttribute(newArray, itemSize, normalized)
}

/**
 * BufferAttribute を安全に編集し、新しい BufferAttribute を返す
 *
 * 元の BufferAttribute は変更されない。
 * InterleavedBufferAttribute も通常の BufferAttribute に変換される。
 *
 * @param attr - 編集元の属性
 * @param editor - 配列を編集するコールバック関数
 * @returns 編集済みの新しい BufferAttribute
 *
 * @example
 * ```typescript
 * // UV座標を変換
 * const newUvAttr = editBufferAttribute(uvAttribute, (array) => {
 *   for (let i = 0; i < array.length; i += 2) {
 *     array[i] = translateU + scaleU * array[i]
 *     array[i + 1] = translateV + scaleV * array[i + 1]
 *   }
 * })
 * geometry.setAttribute('uv', newUvAttr)
 * ```
 */
export function editBufferAttribute<T extends TypedArray = TypedArray>(
  attr: BufferAttribute | InterleavedBufferAttribute,
  editor: (array: T) => void,
): BufferAttribute {
  const cloned = cloneBufferAttribute(attr)
  editor(cloned.array as T)
  cloned.needsUpdate = true
  return cloned
}
