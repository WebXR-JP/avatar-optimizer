import { describe, expect, it } from 'vitest'

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
