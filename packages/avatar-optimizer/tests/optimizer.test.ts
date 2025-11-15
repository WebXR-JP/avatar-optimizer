import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import type { GLTFWithBuffers } from '@loaders.gl/gltf'
import { ResultAsync } from 'neverthrow'

import { optimizeVRM } from '../src/core/optimizer'
import type { LoadersGLVRMDocument } from '../src/vrm/loaders-gl'
import { ScenegraphAdapter } from '../src/vrm/scenegraph-adapter'
import type { OptimizationOptions } from '../src/types'

const loaderState = vi.hoisted(() => ({
  document: undefined as LoadersGLVRMDocument | undefined,
  capturedJson: undefined as any,
}))

const atlasMock = vi.hoisted(() => ({
  buildAtlases: vi.fn(async (descriptors: Array<{ id: string }>) => ({
    atlases: [
      {
        slot: 'baseColor' as const,
        atlasImage: Uint8Array.from([0, 1, 2, 3]),
        atlasWidth: 1,
        atlasHeight: 1,
      },
    ],
    placements: descriptors.map((descriptor) => ({
      materialId: descriptor.id,
      uvTransform: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const,
    })),
  })),
}))

vi.mock('../src/vrm/loaders-gl', () => {
  return {
    readVRMDocumentWithLoadersGL: vi.fn(() =>
      ResultAsync.fromPromise(
        loaderState.document
          ? Promise.resolve(loaderState.document)
          : Promise.reject(new Error('No mock document registered')),
        () => ({
          type: 'DOCUMENT_PARSE_FAILED' as const,
          message: 'Mock document was not initialized',
        }),
      ),
    ),
    writeVRMDocumentWithLoadersGL: vi.fn((document: LoadersGLVRMDocument) => {
      loaderState.capturedJson = JSON.parse(JSON.stringify(document.gltf.json))
      return ResultAsync.fromPromise(Promise.resolve(new ArrayBuffer(8)), () => ({
        type: 'DOCUMENT_PARSE_FAILED' as const,
        message: 'Failed to serialize mock VRM',
      }))
    }),
  }
})

vi.mock('@xrift/avatar-optimizer-texture-atlas', () => ({
  buildAtlases: atlasMock.buildAtlases,
}))

const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAusB9YGTFe4AAAAASUVORK5CYII='

describe.skip('optimizeVRM (legacy pipeline)', () => {
  let decodeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    loaderState.document = undefined
    loaderState.capturedJson = undefined
    atlasMock.buildAtlases.mockClear()
    decodeSpy = vi
      .spyOn(ScenegraphAdapter.prototype as any, 'decodeImageFromScenegraph')
      .mockResolvedValue({
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([0, 0, 0, 255]),
      })
  })

  afterEach(() => {
    decodeSpy.mockRestore()
  })

  it('最適化後にマテリアルのベースカラーがアトラス生成テクスチャを参照する', async () => {
    loaderState.document = createVRM10Document()
    const originalTextureCount = loaderState.document.gltf.json.textures?.length ?? 0
    const options: OptimizationOptions = {
      compressTextures: false,
      maxTextureSize: 512,
      reduceMeshes: false,
    }
    const inputFile = new File([new Uint8Array([0])], 'mock.vrm', { type: 'model/gltf-binary' })

    const result = await optimizeVRM(inputFile, options)
    expect(result.isOk()).toBe(true)
    expect(atlasMock.buildAtlases).toHaveBeenCalled()

    expect(loaderState.capturedJson).toBeDefined()
    const optimizedJson = loaderState.capturedJson
    const finalTextures = optimizedJson.textures ?? []
    expect(finalTextures.length).toBe(originalTextureCount + 1)

    const baseColorIndex =
      optimizedJson.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture?.index
    expect(typeof baseColorIndex).toBe('number')
    expect(baseColorIndex).toBe(finalTextures.length - 1)

    const baseColorTexture = finalTextures[baseColorIndex as number]
    expect(typeof baseColorTexture?.source).toBe('number')
    const atlasImage = optimizedJson.images?.[baseColorTexture.source as number]
    expect(atlasImage?.uri).toBeUndefined()
    expect(typeof atlasImage?.bufferView).toBe('number')
  })
})

function createVRM10Document(): LoadersGLVRMDocument {
  const gltf: GLTFWithBuffers = {
    json: {
      asset: { version: '2.0' },
      materials: [
        {
          name: 'MockMToon',
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
          },
          extensions: {
            VRMC_materials_mtoon: {
              specVersion: '1.0',
              shadeMultiplyTexture: { index: 0 },
            },
          },
        },
      ],
      textures: [{ source: 0 }],
      images: [{ uri: ONE_BY_ONE_PNG, mimeType: 'image/png' }],
      extensions: {
        VRMC_vrm: {
          specVersion: '1.0',
        },
      },
      extensionsUsed: ['VRMC_vrm', 'VRMC_materials_mtoon'],
    },
    buffers: [],
  }

  return { gltf }
}
