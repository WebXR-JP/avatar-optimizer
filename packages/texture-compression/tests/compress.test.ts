import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  compressToKtx2,
  disposeBasisEncoder,
  flipImageY,
  initBasisEncoder,
  isBasisEncoderReady,
  UastcQuality,
} from '../src'

// テスト実行時のベースURL（localhostで動作）
// vitest.config.tsでwasmがpublicDirに設定されているので、ルートから取得
const getWasmDir = () => {
  // ブラウザ環境ではwindow.location.originを使用
  if (typeof window !== 'undefined') {
    return window.location.origin + '/'
  }
  return '/'
}

describe('texture-compression', () => {
  describe('flipImageY', () => {
    it('2x2画像のY軸を反転できる', () => {
      // 2x2 RGBA画像: 上段[赤,緑], 下段[青,白]
      const input = new Uint8Array([
        255,
        0,
        0,
        255, // 赤 (0,0)
        0,
        255,
        0,
        255, // 緑 (1,0)
        0,
        0,
        255,
        255, // 青 (0,1)
        255,
        255,
        255,
        255, // 白 (1,1)
      ])

      const flipped = flipImageY(input, 2, 2)

      // 反転後: 上段[青,白], 下段[赤,緑]
      expect(flipped).toEqual(
        new Uint8Array([
          0,
          0,
          255,
          255, // 青
          255,
          255,
          255,
          255, // 白
          255,
          0,
          0,
          255, // 赤
          0,
          255,
          0,
          255, // 緑
        ]),
      )
    })

    it('1x4画像のY軸を反転できる', () => {
      const input = new Uint8Array([
        1,
        0,
        0,
        255, // row 0
        2,
        0,
        0,
        255, // row 1
        3,
        0,
        0,
        255, // row 2
        4,
        0,
        0,
        255, // row 3
      ])

      const flipped = flipImageY(input, 1, 4)

      expect(flipped).toEqual(
        new Uint8Array([
          4, 0, 0, 255, 3, 0, 0, 255, 2, 0, 0, 255, 1, 0, 0, 255,
        ]),
      )
    })
  })

  describe('compressToKtx2', () => {
    it('不正な画像サイズでエラーを返す', async () => {
      const invalidData = new Uint8Array(100) // 100 bytes != width*height*4

      const result = await compressToKtx2(invalidData, 10, 10)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('INVALID_INPUT')
      }
    })

    it('幅または高さが0でエラーを返す', async () => {
      const data = new Uint8Array(0)

      const result = await compressToKtx2(data, 0, 0)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('INVALID_INPUT')
      }
    })
  })

  describe('BasisEncoder初期化', () => {
    afterAll(() => {
      disposeBasisEncoder()
    })

    it('WASMモジュールを初期化できる', async () => {
      const result = await initBasisEncoder(getWasmDir())

      if (result.isErr()) {
        console.error('初期化エラー:', result.error)
      }
      expect(result.isOk()).toBe(true)
      expect(isBasisEncoderReady()).toBe(true)
    })

    it('初期化後はキャッシュを返す', async () => {
      const result1 = await initBasisEncoder(getWasmDir())
      const result2 = await initBasisEncoder(getWasmDir())

      expect(result1.isOk()).toBe(true)
      expect(result2.isOk()).toBe(true)
      if (result1.isOk() && result2.isOk()) {
        expect(result1.value).toBe(result2.value)
      }
    })
  })

  describe('実際のKTX2圧縮', () => {
    beforeAll(async () => {
      await initBasisEncoder(getWasmDir())
    })

    afterAll(() => {
      disposeBasisEncoder()
    })

    it('4x4のシンプルな画像をKTX2に圧縮できる', async () => {
      // 4x4 RGBA 赤色画像
      const width = 4
      const height = 4
      const imageData = new Uint8Array(width * height * 4)
      for (let i = 0; i < width * height; i++) {
        imageData[i * 4] = 255 // R
        imageData[i * 4 + 1] = 0 // G
        imageData[i * 4 + 2] = 0 // B
        imageData[i * 4 + 3] = 255 // A
      }

      const result = await compressToKtx2(imageData, width, height, {
        quality: UastcQuality.Fastest,
        supercompression: false,
      })

      if (result.isErr()) {
        console.error('圧縮エラー:', result.error)
      }
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.width).toBe(width)
        expect(result.value.height).toBe(height)
        expect(result.value.originalSize).toBe(imageData.length)
        expect(result.value.compressedSize).toBeGreaterThan(0)
        expect(result.value.data.length).toBe(result.value.compressedSize)
        // KTX2マジックナンバー確認
        expect(result.value.data[0]).toBe(0xab) // «
        expect(result.value.data[1]).toBe(0x4b) // K
        expect(result.value.data[2]).toBe(0x54) // T
        expect(result.value.data[3]).toBe(0x58) // X
      }
    })

    it('supercompressionを有効にすると圧縮率が上がる', async () => {
      const width = 64
      const height = 64
      const imageData = new Uint8Array(width * height * 4)
      // グラデーション画像
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4
          imageData[i] = Math.floor((x / width) * 255)
          imageData[i + 1] = Math.floor((y / height) * 255)
          imageData[i + 2] = 128
          imageData[i + 3] = 255
        }
      }

      const resultWithout = await compressToKtx2(imageData, width, height, {
        quality: UastcQuality.Fastest,
        supercompression: false,
      })

      const resultWith = await compressToKtx2(imageData, width, height, {
        quality: UastcQuality.Fastest,
        supercompression: true,
      })

      expect(resultWithout.isOk()).toBe(true)
      expect(resultWith.isOk()).toBe(true)
      if (resultWithout.isOk() && resultWith.isOk()) {
        // 超圧縮ありの方がサイズが小さい
        expect(resultWith.value.compressedSize).toBeLessThan(
          resultWithout.value.compressedSize,
        )
      }
    })
  })
})
