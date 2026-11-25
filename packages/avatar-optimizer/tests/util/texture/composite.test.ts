import { MToonMaterial } from '@pixiv/three-vrm'
import {
  DataTexture,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
} from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateAtlasImagesFromPatterns } from '../../../src/process/gen-atlas'
import type { PatternMaterialMapping } from '../../../src/types'
import {
  composeImagesToAtlas,
  disposeAtlasRenderer,
} from '../../../src/util/texture/composite'

function createSolidTexture(
  r: number,
  g: number,
  b: number,
  a: number,
  width = 4,
  height = 4,
): DataTexture {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  const texture = new DataTexture(
    data,
    width,
    height,
    RGBAFormat,
    UnsignedByteType,
  )
  texture.needsUpdate = true
  return texture
}

function getPixel(
  texture: Texture,
  x: number,
  y: number,
): [number, number, number, number] {
  const image = texture.image as {
    data: Uint8Array
    width: number
    height: number
  }
  const offset = (y * image.width + x) * 4
  return [
    image.data[offset],
    image.data[offset + 1],
    image.data[offset + 2],
    image.data[offset + 3],
  ]
}

function spyWebGLContextCreation() {
  const contexts: Array<WebGLRenderingContext | WebGL2RenderingContext> = []
  const originalGetContext = OffscreenCanvas.prototype.getContext

  const spy = vi
    .spyOn(OffscreenCanvas.prototype, 'getContext')
    .mockImplementation(function (
      this: OffscreenCanvas,
      contextId: OffscreenCanvasRenderingContextId,
      options?: unknown,
    ) {
      const ctx = originalGetContext.call(
        this,
        contextId as '2d',
        options as CanvasRenderingContext2DSettings,
      )
      if ((contextId === 'webgl2' || contextId === 'webgl') && ctx) {
        contexts.push(
          ctx as unknown as WebGLRenderingContext | WebGL2RenderingContext,
        )
      }
      return ctx
    } as typeof OffscreenCanvas.prototype.getContext)

  return { spy, contexts }
}

describe('composeImagesToAtlas', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    disposeAtlasRenderer()
  })

  it('連続呼び出しでも WebGL コンテキストを 1 回だけ生成して再利用し、各出力が正しく描画される', () => {
    const { contexts } = spyWebGLContextCreation()

    // 1回目: 不透明の赤 (8x8)
    const first = composeImagesToAtlas(
      [
        {
          image: createSolidTexture(200, 40, 20, 255),
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(1, 1),
          },
        },
      ],
      { width: 8, height: 8 },
    )
    expect(first.isOk()).toBe(true)
    if (first.isOk()) {
      expect(getPixel(first.value, 4, 4)).toEqual([200, 40, 20, 255])
      first.value.dispose()
    }

    // 2回目: 半透明の青 (16x16)
    const second = composeImagesToAtlas(
      [
        {
          image: createSolidTexture(10, 50, 220, 128),
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(1, 1),
          },
        },
      ],
      { width: 16, height: 16 },
    )
    expect(second.isOk()).toBe(true)
    if (second.isOk()) {
      expect(getPixel(second.value, 8, 8)).toEqual([10, 50, 220, 128])
      second.value.dispose()
    }

    // 3回目: alpha=0 の RGB 保持 + 分割配置 (8x8)
    const third = composeImagesToAtlas(
      [
        {
          image: createSolidTexture(12, 34, 56, 0),
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(0.5, 1),
          },
        },
        {
          image: createSolidTexture(78, 90, 123, 255),
          uvTransform: {
            offset: new Vector2(0.5, 0),
            scale: new Vector2(0.5, 1),
          },
        },
      ],
      { width: 8, height: 8 },
    )
    expect(third.isOk()).toBe(true)
    if (third.isOk()) {
      expect(getPixel(third.value, 1, 4)).toEqual([12, 34, 56, 0])
      expect(getPixel(third.value, 6, 4)).toEqual([78, 90, 123, 255])
      third.value.dispose()
    }

    expect(contexts).toHaveLength(1)
  })

  it('generateAtlasImagesFromPatterns を複数回実行しても WebGL コンテキストは 1 回だけ生成される', () => {
    const { contexts } = spyWebGLContextCreation()

    const mat = new MToonMaterial()
    mat.map = createSolidTexture(240, 120, 60, 255)

    const mappings: PatternMaterialMapping[] = [
      {
        pattern: { slots: new Map() },
        materialIndices: [0],
        textureDescriptor: { width: 4, height: 4 },
      },
    ]
    const placements = [{ offset: new Vector2(0, 0), scale: new Vector2(1, 1) }]

    const first = generateAtlasImagesFromPatterns([mat], mappings, placements, {
      defaultResolution: 16,
    })
    expect(first.isOk()).toBe(true)
    if (first.isOk()) {
      Object.values(first.value).forEach((tex) => tex.dispose())
    }

    const second = generateAtlasImagesFromPatterns(
      [mat],
      mappings,
      placements,
      { defaultResolution: 16 },
    )
    expect(second.isOk()).toBe(true)
    if (second.isOk()) {
      Object.values(second.value).forEach((tex) => tex.dispose())
    }

    expect(contexts).toHaveLength(1)
  })

  it('1回目で dispose された同一の Texture インスタンスを 2 回目に渡しても正しく描画される', () => {
    const { contexts } = spyWebGLContextCreation()
    const sharedTex = createSolidTexture(44, 188, 99, 255)

    const first = composeImagesToAtlas(
      [
        {
          image: sharedTex,
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(1, 1),
          },
        },
      ],
      { width: 8, height: 8 },
    )
    expect(first.isOk()).toBe(true)
    if (first.isOk()) {
      expect(getPixel(first.value, 4, 4)).toEqual([44, 188, 99, 255])
      first.value.dispose()
    }

    const second = composeImagesToAtlas(
      [
        {
          image: sharedTex,
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(1, 1),
          },
        },
      ],
      { width: 8, height: 8 },
    )
    expect(second.isOk()).toBe(true)
    if (second.isOk()) {
      expect(getPixel(second.value, 4, 4)).toEqual([44, 188, 99, 255])
      second.value.dispose()
    }

    expect(contexts).toHaveLength(1)
  })

  it('disposeAtlasRenderer で WebGL コンテキストが解放され、次回呼び出し時に再生成される', () => {
    const { contexts } = spyWebGLContextCreation()

    // 未生成状態で呼んでもエラーにならない（冪等性）
    expect(() => disposeAtlasRenderer()).not.toThrow()
    expect(contexts).toHaveLength(0)

    const first = composeImagesToAtlas(
      [
        {
          image: createSolidTexture(100, 150, 200, 255),
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(1, 1),
          },
        },
      ],
      { width: 8, height: 8 },
    )
    expect(first.isOk()).toBe(true)
    if (first.isOk()) {
      first.value.dispose()
    }
    expect(contexts).toHaveLength(1)
    expect(contexts[0].isContextLost()).toBe(false)

    disposeAtlasRenderer()
    expect(contexts[0].isContextLost()).toBe(true)

    // 解放後に再度呼んでもエラーにならない（冪等性）
    expect(() => disposeAtlasRenderer()).not.toThrow()

    const second = composeImagesToAtlas(
      [
        {
          image: createSolidTexture(50, 100, 150, 255),
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(1, 1),
          },
        },
      ],
      { width: 8, height: 8 },
    )
    expect(second.isOk()).toBe(true)
    if (second.isOk()) {
      expect(getPixel(second.value, 4, 4)).toEqual([50, 100, 150, 255])
      second.value.dispose()
    }
    expect(contexts).toHaveLength(2)
    expect(contexts[1].isContextLost()).toBe(false)
  })

  it('コンテキストロスト発生後の呼び出しで自動的にレンダラーが再生成される', () => {
    const { contexts } = spyWebGLContextCreation()

    const first = composeImagesToAtlas(
      [
        {
          image: createSolidTexture(255, 0, 0, 255),
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(1, 1),
          },
        },
      ],
      { width: 8, height: 8 },
    )
    expect(first.isOk()).toBe(true)
    if (first.isOk()) {
      first.value.dispose()
    }
    expect(contexts).toHaveLength(1)

    const loseExt = contexts[0].getExtension('WEBGL_lose_context')
    expect(loseExt).not.toBeNull()
    loseExt!.loseContext()
    expect(contexts[0].isContextLost()).toBe(true)

    const second = composeImagesToAtlas(
      [
        {
          image: createSolidTexture(0, 255, 0, 255),
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(1, 1),
          },
        },
      ],
      { width: 8, height: 8 },
    )
    expect(second.isOk()).toBe(true)
    if (second.isOk()) {
      expect(getPixel(second.value, 4, 4)).toEqual([0, 255, 0, 255])
      second.value.dispose()
    }
    expect(contexts).toHaveLength(2)
    expect(contexts[1].isContextLost()).toBe(false)
  })

  it('不正なサイズ（width <= 0 または height <= 0）の場合はエラーを返し WebGL コンテキストを生成しない', () => {
    const { contexts } = spyWebGLContextCreation()

    const invalidWidth = composeImagesToAtlas([], { width: 0, height: 8 })
    expect(invalidWidth.isErr()).toBe(true)
    if (invalidWidth.isErr()) {
      expect(invalidWidth.error.type).toBe('INVALID_PARAMETER')
    }

    const invalidHeight = composeImagesToAtlas([], { width: 8, height: -4 })
    expect(invalidHeight.isErr()).toBe(true)
    if (invalidHeight.isErr()) {
      expect(invalidHeight.error.type).toBe('INVALID_PARAMETER')
    }

    expect(contexts).toHaveLength(0)
  })

  it('composeImagesToAtlas 呼び出し後も入力テクスチャの colorSpace が保持される', () => {
    const inputTex = createSolidTexture(255, 128, 64, 255)
    inputTex.colorSpace = SRGBColorSpace

    const result = composeImagesToAtlas(
      [
        {
          image: inputTex,
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(1, 1),
          },
        },
      ],
      { width: 8, height: 8 },
    )

    expect(result.isOk()).toBe(true)
    expect(inputTex.colorSpace).toBe(SRGBColorSpace)
    if (result.isOk()) {
      result.value.dispose()
    }
  })
})
