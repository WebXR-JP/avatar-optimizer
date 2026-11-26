import {
  BufferAttribute,
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
} from 'three'
import { describe, expect, it } from 'vitest'
import { compactIndexedGeometry } from '../../../src/util/mesh/compact-geometry'

describe('compactIndexedGeometry', () => {
  it('未使用頂点を除去し、属性とインデックスを正しくリマップする（正規化 Uint8 属性を含む）', () => {
    const geometry = new BufferGeometry()

    // 6頂点のうち、インデックスは頂点 1, 3, 5 の1三角形のみを参照
    const positions = new Float32Array([
      10,
      10,
      10, // 0: 未使用
      0,
      0,
      0, // 1: 使用
      20,
      20,
      20, // 2: 未使用
      1,
      0,
      0, // 3: 使用
      30,
      30,
      30, // 4: 未使用
      0,
      1,
      0, // 5: 使用
    ])
    const normals = new Float32Array([
      1,
      0,
      0, // 0
      0,
      0,
      1, // 1
      1,
      0,
      0, // 2
      0,
      1,
      0, // 3
      1,
      0,
      0, // 4
      1,
      0,
      0, // 5
    ])
    const uvs = new Float32Array([
      0.9,
      0.9, // 0
      0.1,
      0.2, // 1
      0.8,
      0.8, // 2
      0.3,
      0.4, // 3
      0.7,
      0.7, // 4
      0.5,
      0.6, // 5
    ])
    const skinIndices = new Uint16Array([
      9,
      9,
      9,
      9, // 0
      1,
      2,
      0,
      0, // 1
      9,
      9,
      9,
      9, // 2
      3,
      4,
      0,
      0, // 3
      9,
      9,
      9,
      9, // 4
      5,
      6,
      0,
      0, // 5
    ])
    const skinWeights = new Float32Array([
      1,
      0,
      0,
      0, // 0
      0.6,
      0.4,
      0,
      0, // 1
      1,
      0,
      0,
      0, // 2
      0.7,
      0.3,
      0,
      0, // 3
      1,
      0,
      0,
      0, // 4
      0.8,
      0.2,
      0,
      0, // 5
    ])
    // normalized: true な Uint8Array（例: COLOR_0）
    const colors = new Uint8Array([
      10,
      10,
      10,
      10, // 0
      255,
      128,
      64,
      255, // 1
      20,
      20,
      20,
      20, // 2
      0,
      255,
      100,
      200, // 3
      30,
      30,
      30,
      30, // 4
      50,
      150,
      250,
      255, // 5
    ])

    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
    geometry.setAttribute('skinIndex', new BufferAttribute(skinIndices, 4))
    geometry.setAttribute('skinWeight', new BufferAttribute(skinWeights, 4))
    geometry.setAttribute('color', new BufferAttribute(colors, 4, true))
    geometry.setIndex(new BufferAttribute(new Uint16Array([5, 1, 3]), 1))

    const compacted = compactIndexedGeometry(geometry)

    // 元のジオメトリは変更されていないこと
    expect(geometry.getAttribute('position').count).toBe(6)
    expect(Array.from(geometry.index!.array)).toEqual([5, 1, 3])

    // コンパクション後は3頂点
    expect(compacted.getAttribute('position').count).toBe(3)
    expect(Array.from(compacted.index!.array)).toEqual([2, 0, 1])

    // 各頂点属性の検証
    expect(Array.from(compacted.getAttribute('position').array)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
    ])
    expect(Array.from(compacted.getAttribute('normal').array)).toEqual([
      0, 0, 1, 0, 1, 0, 1, 0, 0,
    ])
    const compactedUv = compacted.getAttribute('uv')
    expect(compactedUv.getX(0)).toBeCloseTo(0.1)
    expect(compactedUv.getY(0)).toBeCloseTo(0.2)
    expect(compactedUv.getX(1)).toBeCloseTo(0.3)
    expect(compactedUv.getY(1)).toBeCloseTo(0.4)
    expect(compactedUv.getX(2)).toBeCloseTo(0.5)
    expect(compactedUv.getY(2)).toBeCloseTo(0.6)

    const compactedSkinIndex = compacted.getAttribute('skinIndex')
    expect(compactedSkinIndex.array).toBeInstanceOf(Uint16Array)
    expect(Array.from(compactedSkinIndex.array)).toEqual([
      1, 2, 0, 0, 3, 4, 0, 0, 5, 6, 0, 0,
    ])

    const compactedColor = compacted.getAttribute('color')
    expect(compactedColor.normalized).toBe(true)
    expect(compactedColor.array).toBeInstanceOf(Uint8Array)
    expect(Array.from(compactedColor.array)).toEqual([
      255, 128, 64, 255, 0, 255, 100, 200, 50, 150, 250, 255,
    ])
  })

  it('非インデックスおよび全頂点使用済みのジオメトリはクローンを返す', () => {
    const nonIndexed = new BufferGeometry()
    nonIndexed.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    )

    const clonedNonIndexed = compactIndexedGeometry(nonIndexed)
    expect(clonedNonIndexed).not.toBe(nonIndexed)
    expect(clonedNonIndexed.getAttribute('position').count).toBe(3)

    const fullyUsed = new BufferGeometry()
    fullyUsed.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    )
    fullyUsed.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2]), 1))

    const clonedFullyUsed = compactIndexedGeometry(fullyUsed)
    expect(clonedFullyUsed).not.toBe(fullyUsed)
    expect(clonedFullyUsed.getAttribute('position').count).toBe(3)
    expect(Array.from(clonedFullyUsed.index!.array)).toEqual([0, 1, 2])
  })

  it('空インデックスのジオメトリは頂点数 0 になる', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    )
    geometry.setAttribute(
      'color',
      new BufferAttribute(
        new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        4,
        true,
      ),
    )
    geometry.setIndex(new BufferAttribute(new Uint16Array(0), 1))

    const compacted = compactIndexedGeometry(geometry)
    expect(compacted.getAttribute('position').count).toBe(0)
    expect(compacted.getAttribute('color').count).toBe(0)
    expect(compacted.getAttribute('color').normalized).toBe(true)
    expect(compacted.getAttribute('color').array).toBeInstanceOf(Uint8Array)
    expect(compacted.index?.count).toBe(0)
  })

  it('InterleavedBufferAttribute（通常・正規化）を正しくコンパクションする', () => {
    const geometry = new BufferGeometry()

    // 4頂点分の float32 interleaved (position: 3, uv: 2 -> stride: 5)
    const floatBuffer = new InterleavedBuffer(
      new Float32Array([
        9,
        9,
        9,
        0.9,
        0.9, // 0: 未使用
        0,
        0,
        0,
        0.1,
        0.2, // 1: 使用
        1,
        0,
        0,
        0.3,
        0.4, // 2: 使用
        0,
        1,
        0,
        0.5,
        0.6, // 3: 使用
      ]),
      5,
    )
    geometry.setAttribute(
      'position',
      new InterleavedBufferAttribute(floatBuffer, 3, 0, false),
    )
    geometry.setAttribute(
      'uv',
      new InterleavedBufferAttribute(floatBuffer, 2, 3, false),
    )

    // normalized: true な Uint8 interleaved (color: 4 -> stride: 4)
    const colorBuffer = new InterleavedBuffer(
      new Uint8Array([
        1,
        1,
        1,
        1, // 0: 未使用
        10,
        20,
        30,
        255, // 1: 使用
        40,
        50,
        60,
        255, // 2: 使用
        70,
        80,
        90,
        255, // 3: 使用
      ]),
      4,
    )
    geometry.setAttribute(
      'color',
      new InterleavedBufferAttribute(colorBuffer, 4, 0, true),
    )
    geometry.setIndex(new BufferAttribute(new Uint16Array([1, 2, 3]), 1))

    const compacted = compactIndexedGeometry(geometry)
    expect(compacted.getAttribute('position').count).toBe(3)
    expect(Array.from(compacted.getAttribute('position').array)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
    ])
    const compactedUv = compacted.getAttribute('uv')
    expect(compactedUv.getX(0)).toBeCloseTo(0.1)
    expect(compactedUv.getY(2)).toBeCloseTo(0.6)

    const compactedColor = compacted.getAttribute('color')
    expect(compactedColor.normalized).toBe(true)
    expect(compactedColor.array).toBeInstanceOf(Uint8Array)
    expect(Array.from(compactedColor.array)).toEqual([
      10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
    ])
  })

  it('preserveMorphAttributes オプションに応じてモーフターゲットを保持または破棄する', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([9, 9, 9, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
        3,
      ),
    )
    geometry.morphAttributes.position = [
      new BufferAttribute(
        new Float32Array([8, 8, 8, 0.1, 0, 0, 0.2, 0, 0, 0.3, 0, 0]),
        3,
      ),
    ]
    geometry.morphTargetsRelative = true
    geometry.setIndex(new BufferAttribute(new Uint16Array([1, 2, 3]), 1))

    const preserved = compactIndexedGeometry(geometry, {
      preserveMorphAttributes: true,
    })
    expect(preserved.morphTargetsRelative).toBe(true)
    expect(preserved.morphAttributes.position).toHaveLength(1)
    expect(preserved.morphAttributes.position[0].count).toBe(3)
    expect(preserved.morphAttributes.position[0].getX(0)).toBeCloseTo(0.1)
    expect(preserved.morphAttributes.position[0].getX(1)).toBeCloseTo(0.2)
    expect(preserved.morphAttributes.position[0].getX(2)).toBeCloseTo(0.3)

    const discarded = compactIndexedGeometry(geometry, {
      preserveMorphAttributes: false,
    })
    expect(discarded.morphTargetsRelative).toBe(false)
    expect(Object.keys(discarded.morphAttributes)).toHaveLength(0)
  })
})
