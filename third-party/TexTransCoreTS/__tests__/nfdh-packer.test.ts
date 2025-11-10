/**
 * NFDH Packer テスト
 *
 * NFDH+FC ベースのパッカーが正しく
 * テクスチャサイズをパックできることを検証
 */

import { packTexturesNFDH } from '../src/atlas/nfdh-packer'
import type { PackedTexture } from '../src/types'

describe('packTexturesNFDH', () => {
  it('should pack a single texture', async () => {
    const sizes = [{ width: 512, height: 512 }]
    const result = await packTexturesNFDH(sizes, 1024, 1024)

    expect(result.packed).toHaveLength(1)
    expect(result.packed[0]).toMatchObject({
      index: 0,
      width: 512,
      height: 512,
    })
    expect(result.packed[0].x).toBeGreaterThanOrEqual(0)
    expect(result.packed[0].y).toBeGreaterThanOrEqual(0)
  })

  it('should pack multiple textures', async () => {
    const sizes = [
      { width: 512, height: 512 },
      { width: 256, height: 256 },
      { width: 128, height: 128 },
    ]
    const result = await packTexturesNFDH(sizes, 1024, 1024)

    expect(result.packed).toHaveLength(3)
    expect(result.packed.find((p) => p.index === 0)).toBeDefined()
    expect(result.packed.find((p) => p.index === 1)).toBeDefined()
    expect(result.packed.find((p) => p.index === 2)).toBeDefined()
  })

  it('should throw an error if a texture is too large', async () => {
    const sizes = [{ width: 1024, height: 1024 }]
    // This should fail because the padding makes it exceed the boundary
    await expect(packTexturesNFDH(sizes, 1024, 1024, 10)).rejects.toThrow()
  })

  it('should not overlap packed textures', async () => {
    const sizes = [
      { width: 512, height: 256 },
      { width: 256, height: 512 },
      { width: 128, height: 128 },
      { width: 256, height: 256 },
    ]
    const result = await packTexturesNFDH(sizes, 1024, 1024)

    expect(result.packed).toHaveLength(4)

    const checkOverlap = (rect1: PackedTexture, rect2: PackedTexture) => {
      return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
      )
    }

    for (let i = 0; i < result.packed.length; i++) {
      for (let j = i + 1; j < result.packed.length; j++) {
        const overlap = checkOverlap(result.packed[i], result.packed[j])
        expect(overlap).toBe(false)
      }
    }
  })

  it('should handle pre-rotation correctly', async () => {
    // This texture is taller than it is wide, so it should be rotated
    const sizes = [{ width: 256, height: 512 }]
    const result = await packTexturesNFDH(sizes, 1024, 1024)

    expect(result.packed).toHaveLength(1)
    // The packed width/height should reflect the original dimensions
    expect(result.packed[0].width).toBe(256)
    expect(result.packed[0].height).toBe(512)
  })
})
