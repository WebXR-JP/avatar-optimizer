/**
 * extractRgbaData メソッドのテスト
 *
 * 様々な画像形式からRGBAデータを正しく抽出できることを確認
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DataTexture, RGBAFormat, UnsignedByteType, FloatType } from 'three'
import { MToonAtlasExporterPlugin } from '../src/extensions/MToonAtlasExporterPlugin'

// MToonAtlasExporterPluginのprivateメソッドをテストするためのヘルパー
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getExtractRgbaData(plugin: MToonAtlasExporterPlugin): (image: any) => Promise<Uint8Array>
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (plugin as any).extractRgbaData.bind(plugin)
}

// モックのGLTFWriterを作成
function createMockWriter()
{
  return {
    json: {},
    pending: [],
    processAccessor: vi.fn(),
    processBufferViewImage: vi.fn().mockResolvedValue(0),
    nodeMap: new Map(),
  }
}

describe('extractRgbaData', () =>
{
  let plugin: MToonAtlasExporterPlugin
  let extractRgbaData: (image: any) => Promise<Uint8Array>

  beforeEach(() =>
  {
    const mockWriter = createMockWriter()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugin = new MToonAtlasExporterPlugin(mockWriter as any)
    extractRgbaData = getExtractRgbaData(plugin)
  })

  describe('DataTexture (image.data)', () =>
  {
    it('Uint8ArrayのDataTextureから正しくRGBAデータを抽出できる', async () =>
    {
      const width = 2
      const height = 2
      // 2x2の赤い画像（RGBA）
      const data = new Uint8Array([
        255, 0, 0, 255, // 左上: 赤
        0, 255, 0, 255, // 右上: 緑
        0, 0, 255, 255, // 左下: 青
        255, 255, 0, 255, // 右下: 黄
      ])

      const image = { data, width, height }
      const result = await extractRgbaData(image)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(width * height * 4)
      // 値が正しくコピーされていることを確認
      expect(result[0]).toBe(255) // R
      expect(result[1]).toBe(0)   // G
      expect(result[2]).toBe(0)   // B
      expect(result[3]).toBe(255) // A
    })

    it('Float32ArrayのDataTextureから正しくRGBAデータを抽出できる（0-1範囲を0-255に変換）', async () =>
    {
      const width = 2
      const height = 2
      // 2x2のfloat画像（RGBA、0.0-1.0）
      const data = new Float32Array([
        1.0, 0.0, 0.0, 1.0, // 左上: 赤
        0.0, 1.0, 0.0, 1.0, // 右上: 緑
        0.0, 0.0, 1.0, 1.0, // 左下: 青
        0.5, 0.5, 0.5, 1.0, // 右下: グレー
      ])

      const image = { data, width, height }
      const result = await extractRgbaData(image)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(width * height * 4)
      // Float32値が正しく変換されていることを確認
      expect(result[0]).toBe(255)  // 1.0 -> 255
      expect(result[1]).toBe(0)    // 0.0 -> 0
      expect(result[12]).toBe(128) // 0.5 -> 128（四捨五入）
    })

    it('範囲外のFloat値をクランプする', async () =>
    {
      const width = 1
      const height = 1
      const data = new Float32Array([
        1.5, -0.5, 2.0, 0.0, // 範囲外の値
      ])

      const image = { data, width, height }
      const result = await extractRgbaData(image)

      expect(result[0]).toBe(255) // 1.5 -> クランプして1.0 -> 255
      expect(result[1]).toBe(0)   // -0.5 -> クランプして0.0 -> 0
      expect(result[2]).toBe(255) // 2.0 -> クランプして1.0 -> 255
      expect(result[3]).toBe(0)   // 0.0 -> 0
    })
  })

  describe('Three.js DataTexture', () =>
  {
    it('Three.jsのDataTexture（Uint8）から正しくRGBAデータを抽出できる', async () =>
    {
      const width = 2
      const height = 2
      const data = new Uint8Array([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255,
        255, 255, 255, 255,
      ])

      const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
      const result = await extractRgbaData(texture.image)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(16)
      expect(result[0]).toBe(255)
    })

    it('Three.jsのDataTexture（Float32）から正しくRGBAデータを抽出できる', async () =>
    {
      const width = 2
      const height = 2
      const data = new Float32Array([
        1.0, 0.0, 0.0, 1.0,
        0.0, 1.0, 0.0, 1.0,
        0.0, 0.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0,
      ])

      const texture = new DataTexture(data, width, height, RGBAFormat, FloatType)
      const result = await extractRgbaData(texture.image)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(16)
      expect(result[0]).toBe(255)  // 1.0 -> 255
      expect(result[4]).toBe(0)    // 0.0 -> 0
    })
  })

  describe('エラーケース', () =>
  {
    it('サポートされていない形式の場合エラーをスローする', async () =>
    {
      const image = { unsupported: true, width: 1, height: 1 }

      await expect(extractRgbaData(image)).rejects.toThrow('サポートされていない画像形式です')
    })

    it('nullの場合は早期にエラーになる（呼び出し元でチェック）', async () =>
    {
      // extractRgbaDataは呼び出し元でnullチェックされるが、念のため
      await expect(extractRgbaData(null)).rejects.toThrow()
    })
  })
})

describe('extractRgbaData - DOM依存テスト（jsdom環境）', () =>
{
  // DOM API（HTMLCanvasElement, HTMLImageElement等）のテストは
  // jsdomでは制限があるため、実際のDOM要素を使用してテスト

  let plugin: MToonAtlasExporterPlugin
  let extractRgbaData: (image: any) => Promise<Uint8Array>

  beforeEach(() =>
  {
    const mockWriter = createMockWriter()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugin = new MToonAtlasExporterPlugin(mockWriter as any)
    extractRgbaData = getExtractRgbaData(plugin)
  })

  afterEach(() =>
  {
    vi.restoreAllMocks()
  })

  describe('HTMLCanvasElement', () =>
  {
    it('HTMLCanvasElementから正しくRGBAデータを抽出できる', async () =>
    {
      // jsdomではCanvas 2D contextが使えないため、モックを使用
      const mockImageData = {
        data: new Uint8ClampedArray([
          255, 0, 0, 255,     // 左上: 赤
          0, 255, 0, 255,     // 右上: 緑
          0, 0, 255, 255,     // 左下: 青
          255, 255, 0, 255,   // 右下: 黄
        ]),
      }
      const mockCtx = {
        getImageData: vi.fn().mockReturnValue(mockImageData),
      }

      // Canvas要素を作成してモック
      const canvas = document.createElement('canvas')
      canvas.width = 2
      canvas.height = 2
      vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D)

      const result = await extractRgbaData(canvas)

      expect(canvas.getContext).toHaveBeenCalledWith('2d')
      expect(mockCtx.getImageData).toHaveBeenCalledWith(0, 0, 2, 2)
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(16)
      // 左上が赤であることを確認
      expect(result[0]).toBe(255) // R
      expect(result[1]).toBe(0)   // G
      expect(result[2]).toBe(0)   // B
      expect(result[3]).toBe(255) // A
    })
  })

  describe('HTMLImageElement', () =>
  {
    it('HTMLImageElementから正しくRGBAデータを抽出できる（モック使用）', async () =>
    {
      // jsdomではHTMLImageElementのモックに制限があるため、
      // Canvas経由で検証する別のアプローチを使用

      // Canvas 2D contextのモック
      const mockImageData = {
        data: new Uint8ClampedArray([128, 128, 128, 255]),
      }
      const mockCtx = {
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue(mockImageData),
      }

      // 実際のcanvasを作成してモック
      const realCanvas = document.createElement('canvas')
      vi.spyOn(realCanvas, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D)
      vi.spyOn(document, 'createElement').mockReturnValue(realCanvas)

      // HTMLImageElementを作成（jsdomでは画像の実際のロードはできない）
      const img = document.createElement('img')
      // width/heightを設定
      Object.defineProperty(img, 'width', { value: 1, writable: false })
      Object.defineProperty(img, 'height', { value: 1, writable: false })

      const result = await extractRgbaData(img)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(4)
      expect(result[0]).toBe(128) // R
    })
  })

  describe('toDataURL対応オブジェクト', () =>
  {
    it('toDataURL対応オブジェクトから正しくRGBAデータを抽出できる', async () =>
    {
      // モックImageData
      const mockImageData = {
        data: new Uint8ClampedArray([255, 0, 0, 255]),
      }
      const mockCtx = {
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue(mockImageData),
      }

      // Canvas作成をモック
      const realCanvas = document.createElement('canvas')
      vi.spyOn(realCanvas, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D)
      vi.spyOn(document, 'createElement').mockReturnValue(realCanvas)

      // 1x1の赤いPNG画像のBase64（data URL）
      const redPixelDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

      // toDataURL対応オブジェクト（OffscreenCanvas風）
      const mockObject = {
        toDataURL: vi.fn().mockReturnValue(redPixelDataUrl),
        width: 1,
        height: 1,
      }

      // jsdomのImageはonloadが非同期で動作するため、直接Image.prototypeを使用
      const originalImage = globalThis.Image
      globalThis.Image = class MockImage
      {
        width = 1
        height = 1
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        private _src = ''

        get src()
        {
          return this._src
        }

        set src(value: string)
        {
          this._src = value
          // 非同期でonloadを呼ぶ
          setTimeout(() =>
          {
            if (this.onload) this.onload()
          }, 0)
        }
      } as unknown as typeof Image

      try
      {
        const result = await extractRgbaData(mockObject)

        expect(mockObject.toDataURL).toHaveBeenCalledWith('image/png')
        expect(result).toBeInstanceOf(Uint8Array)
        expect(result.length).toBe(4)
        expect(result[0]).toBe(255)
      } finally
      {
        globalThis.Image = originalImage
      }
    })
  })
})
