import { describe, expect, it } from 'vitest'
import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three'
import type { AtlasBuildResult } from '@xrift/avatar-optimizer-texture-atlas'
import type { VRM } from '@pixiv/three-vrm'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { ScenegraphAdapter } from '../src/vrm/scenegraph-adapter'
import type { ThreeVRMDocument } from '../src/types'

describe('ScenegraphAdapter (three-based)', () => {
  it('creates atlas descriptors for basic materials', async () => {
    const material = new MeshBasicMaterial()
    material.map = createSolidTexture(2, 2, 0xff0000ff)

    const document = createDocument(material)
    const adapterResult = ScenegraphAdapter.from(document)
    if (adapterResult.isErr()) {
      throw adapterResult.error
    }

    const descriptors = await adapterResult.value.createAtlasMaterialDescriptors()
    expect(descriptors).toHaveLength(1)
    expect(descriptors[0]?.textures[0]?.slot).toBe('baseColor')
    expect(descriptors[0]?.textures[0]?.width).toBe(2)
  })

  it('applies atlas textures and records placements', async () => {
    const material = new MeshBasicMaterial()
    material.map = createSolidTexture(1, 1, 0xffffffff)

    const document = createDocument(material)
    const adapterResult = ScenegraphAdapter.from(document)
    if (adapterResult.isErr()) {
      throw adapterResult.error
    }

    await adapterResult.value.createAtlasMaterialDescriptors()
    const atlasResult = await buildAtlasResult(material.uuid)

    const placements = await adapterResult.value.applyAtlasResult(atlasResult)

    expect(placements).toHaveLength(1)
    expect(placements[0]?.materialUuid).toBe(material.uuid)
    expect((material.map as DataTexture)?.image.width).toBe(4)
  })
})

function createDocument(material: MeshBasicMaterial): ThreeVRMDocument {
  const scene = new Scene()
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
  const mesh = new Mesh(geometry, material)
  scene.add(mesh)

  const vrm = {
    materials: [material],
  } as unknown as VRM

  const gltf = {
    scene,
    scenes: [scene],
    animations: [],
  } as unknown as GLTF

  return { gltf, vrm }
}

function createSolidTexture(width: number, height: number, color: number): DataTexture {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 0] = (color >>> 24) & 0xff
    data[i * 4 + 1] = (color >>> 16) & 0xff
    data[i * 4 + 2] = (color >>> 8) & 0xff
    data[i * 4 + 3] = color & 0xff
  }
  const texture = new DataTexture(data, width, height)
  texture.needsUpdate = true
  return texture
}

async function buildAtlasResult(materialId: string): Promise<AtlasBuildResult> {
  const width = 4
  const height = 4
  const pixelCount = width * height
  const pixels = new Uint8ClampedArray(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    pixels[i * 4 + 0] = 128
    pixels[i * 4 + 1] = 64
    pixels[i * 4 + 2] = 255
    pixels[i * 4 + 3] = 255
  }

  // Encode to PNG via Jimp to reuse adapter decoding path
  const JimpCtor = await loadJimpCtor()
  const image = await new JimpCtor({ data: Buffer.from(pixels), width, height })
  const atlasImage = await image.getBuffer('image/png')

  return {
    atlases: [
      {
        slot: 'baseColor',
        atlasImage: new Uint8Array(atlasImage),
        atlasWidth: width,
        atlasHeight: height,
      },
    ],
    placements: [
      {
        materialId,
        uvTransform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      },
    ],
  }
}

async function loadJimpCtor(): Promise<any> {
  const mod = await import('jimp')
  if (typeof mod === 'function') {
    return mod
  }
  if (typeof (mod as any).default === 'function') {
    return (mod as any).default
  }
  if (typeof (mod as any).Jimp === 'function') {
    return (mod as any).Jimp
  }
  throw new Error('Unable to resolve Jimp constructor for tests')
}
