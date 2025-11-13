import { describe, expect, it } from 'vitest'

import type { GLTFWithBuffers } from '@loaders.gl/gltf'
import type { AtlasBuildResult } from '@xrift/avatar-optimizer-texture-atlas'

import { ScenegraphAdapter } from '../src/vrm/scenegraph-adapter'

const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAusB9YGTFe4AAAAASUVORK5CYII='

function createTestGltf(): GLTFWithBuffers {
  return {
    json: {
      asset: { version: '2.0' },
      materials: [
        {
          name: 'TestMaterial',
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
          },
        },
      ],
      textures: [{ source: 0 }],
      images: [{ uri: ONE_BY_ONE_PNG, mimeType: 'image/png' }],
    },
    buffers: [],
  } as GLTFWithBuffers
}

describe('ScenegraphAdapter', () => {
  it('builds atlas material descriptors from glTF data', async () => {
    const adapter = ScenegraphAdapter.from(createTestGltf())
    mockImageDecoding(adapter)
    const descriptors = await adapter.createAtlasMaterialDescriptors()
    expect(descriptors).toHaveLength(1)
    expect(descriptors[0]?.textures).toHaveLength(1)

    const bitmap = await descriptors[0]!.textures[0]!.readImageData()
    expect(bitmap).toBeInstanceOf(Uint8ClampedArray)
    expect(bitmap.length).toBeGreaterThan(0)
  })

  it('applies atlas result, adds atlas textures, and removes unused originals on flush', async () => {
    const adapter = ScenegraphAdapter.from(createTestGltf())
    mockImageDecoding(adapter)
    const descriptors = await adapter.createAtlasMaterialDescriptors()
    const descriptorId = descriptors[0]?.id
    if (!descriptorId) {
      throw new Error('descriptor id is missing')
    }

    const atlasResult: AtlasBuildResult = {
      atlases: [
        {
          slot: 'baseColor',
          atlasImage: Uint8Array.from([0, 1, 2, 3]),
          atlasWidth: 4,
          atlasHeight: 4,
        },
      ],
      placements: [
        {
          materialId: descriptorId,
          uvTransform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        },
      ],
    }

    adapter.applyAtlasResult(atlasResult)
    adapter.flush()

    const scenegraph = adapter.unwrap()
    const baseColorIndex =
      scenegraph.json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture?.index

    expect(baseColorIndex).toBe(0)
    expect(scenegraph.json.textures).toHaveLength(1)
    expect(scenegraph.json.images).toHaveLength(1)
    expect(scenegraph.json.textures?.[0]?.source).toBe(0)
  })
})

function mockImageDecoding(adapter: ScenegraphAdapter): void {
  Object.assign(adapter as unknown as Record<string, unknown>, {
    decodeImageFromScenegraph: async () => ({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255]),
    }),
  })
}
