/**
 * Bin Packer テスト
 *
 * MaxRects ベースの BinPacker が正しく
 * テクスチャサイズをパックできることを検証
 */

import { BinPacker, packTextures } from '../src/atlas/packer'

describe('BinPacker', () => {
  it('should pack single texture', () => {
    const packer = new BinPacker(2048, 2048)
    const packed = packer.pack([{ width: 512, height: 512 }])

    expect(packed).toHaveLength(1)
    expect(packed[0]).toMatchObject({
      index: 0,
      x: 0,
      y: 0,
      width: 512,
      height: 512,
    })
  })

  it('should pack multiple textures', () => {
    const packer = new BinPacker(2048, 2048)
    const packed = packer.pack([
      { width: 512, height: 512 },
      { width: 256, height: 256 },
      { width: 128, height: 128 },
    ])

    expect(packed).toHaveLength(3)
    expect(packed[0].index).toBe(0)
    expect(packed[1].index).toBe(1)
    expect(packed[2].index).toBe(2)
  })

  it('should apply padding between textures', () => {
    const packer = new BinPacker(2048, 2048, 4)
    const packed = packer.pack([
      { width: 512, height: 512 },
      { width: 512, height: 512 },
    ])

    expect(packed).toHaveLength(2)
    // 最初のテクスチャと 2 番目のテクスチャが重ならないことを確認
    const rect1 = packed[0]
    const rect2 = packed[1]

    const overlap =
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y

    expect(overlap).toBe(false)
  })

  it('should fail when texture is too large', () => {
    const packer = new BinPacker(512, 512)
    expect(() => {
      packer.pack([{ width: 1024, height: 1024 }])
    }).toThrow()
  })

  it('should calculate packing efficiency', () => {
    const packer = new BinPacker(1024, 1024)
    packer.pack([{ width: 512, height: 512 }])

    const efficiency = packer.getPackingEfficiency()
    expect(efficiency).toBeGreaterThan(0)
    expect(efficiency).toBeLessThanOrEqual(1)

    // 512x512 = 262144, 1024x1024 = 1048576
    // efficiency ≈ 262144 / 1048576 ≈ 0.25
    expect(efficiency).toBeCloseTo(0.25, 1)
  })
})

describe('packTextures', () => {
  it('should return packing result', async () => {
    const result = await packTextures(
      [{ width: 256, height: 256 }],
      2048,
      2048,
      4,
    )

    expect(result).toHaveProperty('atlasWidth', 2048)
    expect(result).toHaveProperty('atlasHeight', 2048)
    expect(result.packed).toHaveLength(1)
  })
})
