import {
  BufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
} from 'three'
import { describe, expect, it } from 'vitest'
import {
  cloneBufferAttribute,
  editBufferAttribute,
} from '../../../src/util/mesh/buffer-attribute'

describe('buffer-attribute', () => {
  describe('cloneBufferAttribute', () => {
    it('Float32Array の BufferAttribute をコピーできる', () => {
      const original = new BufferAttribute(
        new Float32Array([1, 2, 3, 4, 5, 6]),
        3,
      )

      const cloned = cloneBufferAttribute(original)

      // 値が同じ
      expect(Array.from(cloned.array)).toEqual([1, 2, 3, 4, 5, 6])
      expect(cloned.itemSize).toBe(3)
      expect(cloned.count).toBe(2)

      // 配列が独立している
      expect(cloned.array).not.toBe(original.array)
      ;(cloned.array as Float32Array)[0] = 999
      expect(original.array[0]).toBe(1)
    })

    it('Uint16Array の BufferAttribute をコピーできる', () => {
      const original = new BufferAttribute(
        new Uint16Array([0, 1, 2, 3]),
        4,
        false,
      )

      const cloned = cloneBufferAttribute(original)

      expect(cloned.array).toBeInstanceOf(Uint16Array)
      expect(Array.from(cloned.array)).toEqual([0, 1, 2, 3])
      expect(cloned.itemSize).toBe(4)
    })

    it('Uint8Array の BufferAttribute をコピーできる', () => {
      const original = new BufferAttribute(new Uint8Array([255, 128, 64, 0]), 1)

      const cloned = cloneBufferAttribute(original)

      expect(cloned.array).toBeInstanceOf(Uint8Array)
      expect(Array.from(cloned.array)).toEqual([255, 128, 64, 0])
    })

    it('normalized フラグを保持する', () => {
      const original = new BufferAttribute(new Float32Array([0.5, 0.5]), 2, true)

      const cloned = cloneBufferAttribute(original)

      expect(cloned.normalized).toBe(true)
    })

    it('InterleavedBufferAttribute を通常の BufferAttribute に変換できる', () => {
      // インターリーブバッファ: position(vec3) + uv(vec2) = stride 5
      // 頂点0: [x0, y0, z0, u0, v0]
      // 頂点1: [x1, y1, z1, u1, v1]
      const interleavedData = new Float32Array([
        1, 2, 3, 0.0, 0.0, // 頂点0
        4, 5, 6, 1.0, 1.0, // 頂点1
      ])
      const interleavedBuffer = new InterleavedBuffer(interleavedData, 5)

      // position 属性 (offset 0, itemSize 3)
      const positionAttr = new InterleavedBufferAttribute(
        interleavedBuffer,
        3,
        0,
      )
      // uv 属性 (offset 3, itemSize 2)
      const uvAttr = new InterleavedBufferAttribute(interleavedBuffer, 2, 3)

      // position をクローン
      const clonedPosition = cloneBufferAttribute(positionAttr)
      expect(clonedPosition).toBeInstanceOf(BufferAttribute)
      expect(clonedPosition).not.toBeInstanceOf(InterleavedBufferAttribute)
      expect(clonedPosition.itemSize).toBe(3)
      expect(clonedPosition.count).toBe(2)
      expect(Array.from(clonedPosition.array)).toEqual([1, 2, 3, 4, 5, 6])

      // uv をクローン
      const clonedUv = cloneBufferAttribute(uvAttr)
      expect(clonedUv.itemSize).toBe(2)
      expect(clonedUv.count).toBe(2)
      expect(Array.from(clonedUv.array)).toEqual([0.0, 0.0, 1.0, 1.0])
    })

    it('共有 ArrayBuffer からも独立したコピーを作成できる', () => {
      // 同じ ArrayBuffer を共有する2つの BufferAttribute
      const sharedBuffer = new ArrayBuffer(24) // 6 floats
      const array1 = new Float32Array(sharedBuffer, 0, 3)
      const array2 = new Float32Array(sharedBuffer, 12, 3)
      array1.set([1, 2, 3])
      array2.set([4, 5, 6])

      const attr1 = new BufferAttribute(array1, 3)

      const cloned = cloneBufferAttribute(attr1)

      // 元の配列を変更してもクローンに影響しない
      array1[0] = 999
      expect(cloned.array[0]).toBe(1)
    })
  })

  describe('editBufferAttribute', () => {
    it('BufferAttribute を安全に編集できる', () => {
      const original = new BufferAttribute(
        new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        2,
      )

      const edited = editBufferAttribute<Float32Array>(original, (array) => {
        // UV座標を変換: scale 0.5, offset 0.25
        for (let i = 0; i < array.length; i += 2) {
          array[i] = 0.25 + 0.5 * array[i]
          array[i + 1] = 0.25 + 0.5 * array[i + 1]
        }
      })

      // 元の配列は変更されていない
      expect(original.array[0]).toBe(0)
      expect(original.array[1]).toBe(0)

      // 編集結果が正しい
      expect(edited.array[0]).toBeCloseTo(0.25) // 0 * 0.5 + 0.25
      expect(edited.array[1]).toBeCloseTo(0.25)
      expect(edited.array[2]).toBeCloseTo(0.75) // 1 * 0.5 + 0.25
      expect(edited.array[3]).toBeCloseTo(0.25)
    })

    it('needsUpdate フラグが設定される', () => {
      const original = new BufferAttribute(new Float32Array([1, 2, 3]), 3)
      // 明示的に false に設定してテスト
      original.needsUpdate = false

      const edited = editBufferAttribute(original, () => {
        // 何もしない
      })

      // editBufferAttribute は新しい BufferAttribute を返すので
      // needsUpdate が true に設定されていることを確認
      // Three.js の BufferAttribute では needsUpdate を true に設定すると
      // 内部的にバージョンが更新される
      expect(edited.version).toBeGreaterThan(0)
    })

    it('InterleavedBufferAttribute を編集して通常の BufferAttribute を返す', () => {
      const interleavedData = new Float32Array([
        1, 2, 3, 0.0, 0.0,
        4, 5, 6, 1.0, 1.0,
      ])
      const interleavedBuffer = new InterleavedBuffer(interleavedData, 5)
      const positionAttr = new InterleavedBufferAttribute(
        interleavedBuffer,
        3,
        0,
      )

      const edited = editBufferAttribute<Float32Array>(
        positionAttr,
        (array) => {
          // Y軸180度回転: x = -x, z = -z
          for (let i = 0; i < array.length; i += 3) {
            array[i] = -array[i]
            array[i + 2] = -array[i + 2]
          }
        },
      )

      expect(edited).toBeInstanceOf(BufferAttribute)
      expect(edited).not.toBeInstanceOf(InterleavedBufferAttribute)
      expect(Array.from(edited.array)).toEqual([-1, 2, -3, -4, 5, -6])

      // 元のインターリーブバッファは変更されていない
      expect(interleavedData[0]).toBe(1)
      expect(interleavedData[2]).toBe(3)
    })

    it('Uint16Array の編集もサポートする', () => {
      const original = new BufferAttribute(
        new Uint16Array([0, 1, 2, 3, 4, 5, 6, 7]),
        4,
      )

      const edited = editBufferAttribute<Uint16Array>(original, (array) => {
        // ボーンインデックスをリマップ
        for (let i = 0; i < array.length; i++) {
          array[i] = array[i] + 10
        }
      })

      expect(edited.array).toBeInstanceOf(Uint16Array)
      expect(Array.from(edited.array)).toEqual([10, 11, 12, 13, 14, 15, 16, 17])
      expect(Array.from(original.array)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    })
  })
})
