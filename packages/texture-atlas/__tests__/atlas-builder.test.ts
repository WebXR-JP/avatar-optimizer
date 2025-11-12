import { describe, expect, it } from 'vitest'

import { buildAtlases } from '../src/core/atlas-builder'
import type { AtlasMaterialDescriptor, TextureSlot } from '../src/types'

function createSolidImage(width: number, height: number, color: number): Uint8Array {
  const data = new Uint8Array(width * height * 4)
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

function createTexture(
  id: string,
  slot: TextureSlot,
  width: number,
  height: number,
  color: number,
) {
  return {
    id,
    slot,
    width,
    height,
    async readImageData() {
      return createSolidImage(width, height, color)
    },
  }
}

describe('buildAtlases', () => {
  it('builds atlases for each slot and returns placements', async () => {
    const materialA: AtlasMaterialDescriptor = {
      id: 'materialA',
      primaryTextureIndex: 0,
      textures: [
        createTexture('matA-base', 'baseColor', 64, 64, 0xff0000ff),
        createTexture('matA-normal', 'normal', 64, 64, 0x00ff00ff),
      ],
    }

    const materialB: AtlasMaterialDescriptor = {
      id: 'materialB',
      primaryTextureIndex: 0,
      textures: [createTexture('matB-base', 'baseColor', 64, 64, 0x0000ffff)],
    }

    const result = await buildAtlases([materialA, materialB], { maxSize: 256 })

    expect(result.atlases).toHaveLength(2)
    const slots = result.atlases.map((atlas) => atlas.slot).sort()
    expect(slots).toEqual(['baseColor', 'normal'])

    result.atlases.forEach((atlas) => {
      expect(atlas.atlasWidth).toBe(256)
      expect(atlas.atlasHeight).toBe(256)
      expect(atlas.atlasImage).toBeInstanceOf(Uint8Array)
      expect(atlas.atlasImage.length).toBeGreaterThan(50)
      expect(atlas.atlasImage[0]).toBe(0x89)
      expect(atlas.atlasImage[1]).toBe(0x50)
    })

    expect(result.placements).toHaveLength(2)
    const placement = result.placements.find((p) => p.materialId === 'materialA')
    expect(placement).toBeDefined()
    expect(placement?.uvTransform[8]).toBe(1)
  })

  it('produces identity scale for single material matching atlas size', async () => {
    const singleMaterial: AtlasMaterialDescriptor = {
      id: 'single',
      primaryTextureIndex: 0,
      textures: [createTexture('single-base', 'baseColor', 128, 128, 0xffffffff)],
    }

    const result = await buildAtlases([singleMaterial], { maxSize: 128 })

    expect(result.atlases).toHaveLength(1)
    const placement = result.placements[0]
    expect(placement.materialId).toBe('single')
    expect(placement.uvTransform[0]).toBeCloseTo(1)
    expect(placement.uvTransform[4]).toBeCloseTo(1)
    expect(placement.uvTransform[2]).toBeCloseTo(0)
    expect(placement.uvTransform[5]).toBeCloseTo(0)
  })
})
