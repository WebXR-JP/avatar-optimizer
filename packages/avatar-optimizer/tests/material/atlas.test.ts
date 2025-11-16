import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { Matrix3, Texture, CanvasTexture } from 'three'
import { composeImagesToAtlas } from '../../src/material/image'

// Mock OffscreenCanvas for Node.js environment
if (typeof OffscreenCanvas === 'undefined') {
  // @ts-ignore
  global.OffscreenCanvas = class OffscreenCanvas {
    width: number
    height: number

    constructor(width: number, height: number) {
      this.width = width
      this.height = height
    }

    getContext(contextType: string) {
      return {
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(this.width * this.height * 4),
          width: this.width,
          height: this.height,
        })),
      }
    }

    convertToBlob() {
      return Promise.resolve(new Blob())
    }
  }
}

/**
 * 2 の n 乗への丸め関数（テスト用に内部関数を再実装）
 */
function roundToNearestPowerOfTwo(value: number): number
{
  if (value <= 0) return 512
  const lower = Math.pow(2, Math.floor(Math.log2(value)))
  const upper = lower * 2
  return value - lower < upper - value ? lower : upper
}

// Helper function for UV remapping (copied from atlasTexture.ts for testing)
interface IslandRegion {
  sourceTextureIndex: number
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  targetX: number
  targetY: number
  targetWidth: number
  targetHeight: number
  rotation: number
  padding: number
}

// Helper function for UV remapping (copied from atlasTexture.ts for testing)
function remapUVCoordinate(
  oldU: number,
  oldV: number,
  region: IslandRegion,
  atlasWidth: number,
  atlasHeight: number,
): { newU: number; newV: number } {
  const sourcePixelX = oldU * region.sourceWidth
  const sourcePixelY = oldV * region.sourceHeight

  const atlasPixelX = region.targetX + sourcePixelX
  const atlasPixelY = region.targetY + sourcePixelY

  const newU = atlasPixelX / atlasWidth
  const newV = atlasPixelY / atlasHeight

  return { newU, newV }
}

describe('remapUVCoordinate', () => {
  it('should remap UV coordinates correctly for a simple case', () => {
    const region: IslandRegion = {
      sourceTextureIndex: 0,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 512,
      sourceHeight: 512,
      targetX: 0,
      targetY: 0,
      targetWidth: 512,
      targetHeight: 512,
      rotation: 0,
      padding: 0,
    }
    const { newU, newV } = remapUVCoordinate(0.5, 0.5, region, 2048, 2048)
    expect(newU).toBeCloseTo((0.5 * 512) / 2048)
    expect(newV).toBeCloseTo((0.5 * 512) / 2048)
  })

  it('should remap UV coordinates correctly for an offset region', () => {
    const region: IslandRegion = {
      sourceTextureIndex: 0,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 256,
      sourceHeight: 256,
      targetX: 100, // Offset in atlas
      targetY: 200, // Offset in atlas
      targetWidth: 256,
      targetHeight: 256,
      rotation: 0,
      padding: 0,
    }
    const atlasWidth = 1024
    const atlasHeight = 1024

    // UV (0.5, 0.5) in original 256x256 texture
    // -> pixel (128, 128) in original
    // -> pixel (100 + 128, 200 + 128) = (228, 328) in atlas
    // -> new UV (228/1024, 328/1024)
    const { newU, newV } = remapUVCoordinate(0.5, 0.5, region, atlasWidth, atlasHeight)
    expect(newU).toBeCloseTo(228 / 1024)
    expect(newV).toBeCloseTo(328 / 1024)
  })

  it('should handle different source and target dimensions (scaling)', () => {
    const region: IslandRegion = {
      sourceTextureIndex: 0,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 100,
      sourceHeight: 100,
      targetX: 0,
      targetY: 0,
      targetWidth: 200, // Scaled up in atlas
      targetHeight: 200,
      rotation: 0,
      padding: 0,
    }
    const atlasWidth = 400
    const atlasHeight = 400

    // UV (0.5, 0.5) in original 100x100 texture
    // -> pixel (50, 50) in original
    // -> pixel (0 + 50, 0 + 50) = (50, 50) in atlas (relative to target region)
    // -> new UV (50/400, 50/400)
    const { newU, newV } = remapUVCoordinate(0.5, 0.5, region, atlasWidth, atlasHeight)
    expect(newU).toBeCloseTo(50 / 400)
    expect(newV).toBeCloseTo(50 / 400)
  })
})

// TODO: These tests require WebGL context and only work in browser environment
describe.skip('composeImagesToAtlas', () => {
  let canvas: OffscreenCanvas

  beforeEach(() => {
    canvas = new OffscreenCanvas(256, 256)
  })

  afterEach(() => {
    canvas = null as any
  })

  /**
   * テクスチャイメージデータ付きCanvasTextureを作成するヘルパー
   */
  function createTestTexture(width: number, height: number): Texture
  {
    const testCanvas = new OffscreenCanvas(width, height)
    const ctx = testCanvas.getContext('2d')!
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, width, height)
    return new CanvasTexture(testCanvas as unknown as HTMLCanvasElement)
  }

  /**
   * 単位行列のUV変換を作成
   */
  function createIdentityMatrix(): Matrix3
  {
    return new Matrix3().set(
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    )
  }

  /**
   * スケール + オフセット付きUV変換を作成
   */
  function createTransformMatrix(
    scaleU: number,
    scaleV: number,
    translateU: number,
    translateV: number,
  ): Matrix3
  {
    return new Matrix3().set(
      scaleU, 0, translateU,
      0, scaleV, translateV,
      0, 0, 1,
    )
  }

  it('should compose a single layer with identity transform', () => {
    const texture = createTestTexture(128, 128)
    const layers = [
      {
        image: texture,
        uvTransform: createIdentityMatrix(),
      },
    ]

    const result = composeImagesToAtlas(layers, {
      width: 256,
      height: 256,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk())
    {
      const atlasTexture = result.value
      expect(atlasTexture).toBeDefined()
      expect(atlasTexture.image).toBeDefined()
    }
  })

  it('should compose multiple layers with different transforms', () => {
    const texture1 = createTestTexture(64, 64)
    const texture2 = createTestTexture(64, 64)

    const layers = [
      {
        image: texture1,
        uvTransform: createTransformMatrix(1, 1, 0, 0),
      },
      {
        image: texture2,
        uvTransform: createTransformMatrix(1, 1, 0.25, 0.25),
      },
    ]

    const result = composeImagesToAtlas(layers, {
      width: 256,
      height: 256,
    })

    expect(result.isOk()).toBe(true)
  })

  it('should return error for invalid atlas dimensions', () => {
    const layers = [
      {
        image: createTestTexture(64, 64),
        uvTransform: createIdentityMatrix(),
      },
    ]

    const result = composeImagesToAtlas(layers, {
      width: 0,
      height: 256,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr())
    {
      expect(result.error.message).toContain('positive')
    }
  })
})

describe('roundToNearestPowerOfTwo', () => {
  it('should round 512 to 512 (exact power of 2)', () => {
    expect(roundToNearestPowerOfTwo(512)).toBe(512)
  })

  it('should round 256 to 256 (exact power of 2)', () => {
    expect(roundToNearestPowerOfTwo(256)).toBe(256)
  })

  it('should round 600 to 512 (closer to lower)', () => {
    expect(roundToNearestPowerOfTwo(600)).toBe(512)
  })

  it('should round 700 to 512 (closer to lower)', () => {
    expect(roundToNearestPowerOfTwo(700)).toBe(512)
  })

  it('should round 768 to 1024 (exactly between, rounds up)', () => {
    expect(roundToNearestPowerOfTwo(768)).toBe(1024)
  })

  it('should round 1000 to 1024 (closer to upper)', () => {
    expect(roundToNearestPowerOfTwo(1000)).toBe(1024)
  })

  it('should round 1 to 1 (smallest value, exact power of 2)', () => {
    expect(roundToNearestPowerOfTwo(1)).toBe(1)
  })

  it('should return 512 for invalid values (≤ 0)', () => {
    expect(roundToNearestPowerOfTwo(0)).toBe(512)
    expect(roundToNearestPowerOfTwo(-100)).toBe(512)
  })

  it('should round 2048.5 correctly', () => {
    expect(roundToNearestPowerOfTwo(2048.5)).toBe(2048)
  })
})
