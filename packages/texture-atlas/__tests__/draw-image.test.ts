/**
 * draw-image.ts の単体テスト
 *
 * テストの焦点:
 * 1. 複数の画像データをアトラスに正しく合成できるか
 * 2. アトラス画像が正しいサイズで生成されるか
 * 3. PNG バッファへの変換が正しくできるか
 * 4. エラーハンドリング（入力チェック）
 */

import { drawImagesToAtlas, drawImagesToAtlasBuffer } from '../src/atlas/draw-image-jimp'
import type { PackingResult, PackedTexture } from '../src/types'

/**
 * テスト用の単純な画像データを生成
 * @param width - 幅
 * @param height - 高さ
 * @param color - RGBA カラー値（0xRRGGBBAA）
 */
function createTestImageData(
  width: number,
  height: number,
  color: number = 0xff0000ff, // デフォルト: 赤
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  const r = (color >> 24) & 0xff
  const g = (color >> 16) & 0xff
  const b = (color >> 8) & 0xff
  const a = color & 0xff

  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }

  return data
}

describe('drawImagesToAtlas', () => {
  it('should draw single image to atlas', async () => {
    const imageData = createTestImageData(256, 256, 0xff0000ff) // 赤

    const packing: PackingResult = {
      atlasWidth: 512,
      atlasHeight: 512,
      packed: [
        {
          index: 0,
          x: 0,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
      ],
    }

    const result = await drawImagesToAtlas(packing, [imageData])

    // アトラス画像データが返される
    expect(result).toBeInstanceOf(Uint8ClampedArray)
    // アトラスサイズ分のデータ（RGBA）
    expect(result.length).toBe(512 * 512 * 4)
  })

  it('should draw multiple images to atlas without overlap', async () => {
    const image1 = createTestImageData(256, 256, 0xff0000ff) // 赤
    const image2 = createTestImageData(256, 256, 0x00ff00ff) // 緑
    const image3 = createTestImageData(256, 256, 0x0000ffff) // 青

    const packing: PackingResult = {
      atlasWidth: 512,
      atlasHeight: 512,
      packed: [
        {
          index: 0,
          x: 0,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
        {
          index: 1,
          x: 256,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
        {
          index: 2,
          x: 0,
          y: 256,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
      ],
    }

    const result = await drawImagesToAtlas(packing, [image1, image2, image3])

    expect(result).toBeInstanceOf(Uint8ClampedArray)
    expect(result.length).toBe(512 * 512 * 4)

    // 各領域の色をサンプリング（簡易チェック）
    // 左上: 赤
    const topLeftIndex = (0 * 512 + 0) * 4
    expect(result[topLeftIndex]).toBe(0xff) // R
    expect(result[topLeftIndex + 1]).toBe(0x00) // G
    expect(result[topLeftIndex + 2]).toBe(0x00) // B
  })

  it('should handle image resizing during packing', async () => {
    // 元のサイズ 512x512、パッキング時に 256x256 にリサイズ
    const imageData = createTestImageData(512, 512, 0xff0000ff)

    const packing: PackingResult = {
      atlasWidth: 512,
      atlasHeight: 512,
      packed: [
        {
          index: 0,
          x: 0,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 512,
          sourceHeight: 512,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
      ],
    }

    const result = await drawImagesToAtlas(packing, [imageData])

    expect(result).toBeInstanceOf(Uint8ClampedArray)
    expect(result.length).toBe(512 * 512 * 4)
  })

  it('should throw error when no packed textures', async () => {
    const packing: PackingResult = {
      atlasWidth: 512,
      atlasHeight: 512,
      packed: [],
    }

    await expect(drawImagesToAtlas(packing, [])).rejects.toThrow(
      'No packed textures provided',
    )
  })

  it('should throw error when packing and images length mismatch', async () => {
    const imageData = createTestImageData(256, 256)

    const packing: PackingResult = {
      atlasWidth: 512,
      atlasHeight: 512,
      packed: [
        {
          index: 0,
          x: 0,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
        {
          index: 1,
          x: 256,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
      ],
    }

    // packed は2つだが images は1つ
    await expect(drawImagesToAtlas(packing, [imageData])).rejects.toThrow(
      'Packing result and images length mismatch',
    )
  })
})

describe('drawImagesToAtlasBuffer', () => {
  it('should convert atlas to PNG buffer', async () => {
    const imageData = createTestImageData(256, 256, 0xff0000ff)

    const packing: PackingResult = {
      atlasWidth: 512,
      atlasHeight: 512,
      packed: [
        {
          index: 0,
          x: 0,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
      ],
    }

    const result = await drawImagesToAtlasBuffer(packing, [imageData])

    // PNG バッファが返される
    expect(result).toBeInstanceOf(Uint8Array)
    // PNG 署名: 89 50 4E 47
    expect(result[0]).toBe(0x89)
    expect(result[1]).toBe(0x50)
    expect(result[2]).toBe(0x4e)
    expect(result[3]).toBe(0x47)
    // 最小限のサイズがある
    expect(result.length).toBeGreaterThan(67) // PNG ヘッダー + IHDR チャンク以上
  })

  it('should create PNG buffer from multiple images', async () => {
    const image1 = createTestImageData(256, 256, 0xff0000ff)
    const image2 = createTestImageData(256, 256, 0x00ff00ff)

    const packing: PackingResult = {
      atlasWidth: 512,
      atlasHeight: 512,
      packed: [
        {
          index: 0,
          x: 0,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
        {
          index: 1,
          x: 256,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
      ],
    }

    const result = await drawImagesToAtlasBuffer(packing, [image1, image2])

    expect(result).toBeInstanceOf(Uint8Array)
    // PNG シグネチャチェック
    expect(result[0]).toBe(0x89)
    expect(result[1]).toBe(0x50)
    expect(result[2]).toBe(0x4e)
    expect(result[3]).toBe(0x47)
  })

  it('should throw error when no packed textures', async () => {
    const packing: PackingResult = {
      atlasWidth: 512,
      atlasHeight: 512,
      packed: [],
    }

    await expect(drawImagesToAtlasBuffer(packing, [])).rejects.toThrow(
      'No packed textures provided',
    )
  })

  it('should throw error when packing and images length mismatch', async () => {
    const imageData = createTestImageData(256, 256)

    const packing: PackingResult = {
      atlasWidth: 512,
      atlasHeight: 512,
      packed: [
        {
          index: 0,
          x: 0,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
        {
          index: 1,
          x: 256,
          y: 0,
          width: 256,
          height: 256,
          sourceWidth: 256,
          sourceHeight: 256,
          scaledWidth: 256,
          scaledHeight: 256,
        } as PackedTexture,
      ],
    }

    await expect(drawImagesToAtlasBuffer(packing, [imageData])).rejects.toThrow(
      'Packing result and images length mismatch',
    )
  })
})
