import { describe, expect, it } from 'vitest'

import type { GLTFWithBuffers } from '@loaders.gl/gltf'
import type { AtlasBuildResult, TextureSlot } from '@xrift/avatar-optimizer-texture-atlas'

import { ScenegraphAdapter } from '../src/vrm/scenegraph-adapter'

const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAusB9YGTFe4AAAAASUVORK5CYII='
const SHADE_SLOT: TextureSlot = 'custom:shadeMultiply'

function createTestGltf(options?: {
  vrmVersion?: '0.x' | '1.0'
  includeVrmExtension?: boolean
  includeNonMToonMaterial?: boolean
}): GLTFWithBuffers {
  const vrmVersion = options?.vrmVersion ?? '1.0'
  if (vrmVersion === '0.x') {
    return createVRM0TestGltf(options)
  }
  return createVRM10TestGltf(options)
}

function createVRM10TestGltf(options?: {
  includeVrmExtension?: boolean
  includeNonMToonMaterial?: boolean
  includeMToonMaterial?: boolean
}): GLTFWithBuffers {
  const includeVrmExtension = options?.includeVrmExtension ?? true
  const includeMToonMaterial = options?.includeMToonMaterial ?? true

  const json: any = {
    asset: { version: '2.0' },
    materials: [],
    textures: [{ source: 0 }],
    images: [{ uri: ONE_BY_ONE_PNG, mimeType: 'image/png' }],
  }

  if (includeVrmExtension) {
    json.extensions = {
      VRMC_vrm: {
        specVersion: '1.0',
      },
    }
    json.extensionsUsed = ['VRMC_vrm', 'VRMC_materials_mtoon']
  }

  if (includeMToonMaterial) {
    json.materials.push(createVRM10MToonMaterial())
  }

  if (options?.includeNonMToonMaterial) {
    json.materials.push({
      name: 'StandardMaterial',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
      },
    })
  }

  if (!json.materials.length) {
    json.materials.push({
      name: 'FallbackMaterial',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
      },
    })
  }

  return {
    json,
    buffers: [],
  } as GLTFWithBuffers
}

function createVRM10MToonMaterial(): Record<string, unknown> {
  return {
    name: 'VRM10MToon',
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
    },
    normalTexture: { index: 0 },
    emissiveTexture: { index: 0 },
    extensions: {
      VRMC_materials_mtoon: {
        specVersion: '1.0',
        shadeMultiplyTexture: { index: 0 },
        rimMultiplyTexture: { index: 0 },
        outlineWidthMultiplyTexture: { index: 0 },
        matcapTexture: { index: 0 },
        uvAnimationMaskTexture: { index: 0 },
      },
    },
  }
}

function createVRM0TestGltf(options?: {
  includeVrmExtension?: boolean
  includeNonMToonMaterial?: boolean
  includeMToonMaterial?: boolean
}): GLTFWithBuffers {
  const includeVrmExtension = options?.includeVrmExtension ?? true
  const includeMToonMaterial = options?.includeMToonMaterial ?? true

  const materials: Record<string, unknown>[] = []
  const materialProperties: Record<string, unknown>[] = []

  if (includeMToonMaterial) {
    materials.push({ name: 'VRM0MToon' })
    materialProperties.push(createVRM0MaterialProperty('VRM0MToon', 'VRM/MToon'))
  }

  if (options?.includeNonMToonMaterial) {
    materials.push({ name: 'VRM0Other' })
    materialProperties.push(createVRM0MaterialProperty('VRM0Other', 'VRM/UnlitTexture'))
  }

  if (!materials.length) {
    materials.push({ name: 'VRM0Fallback' })
  }

  const json: any = {
    asset: { version: '2.0' },
    materials,
    textures: [{ source: 0 }],
    images: [{ uri: ONE_BY_ONE_PNG, mimeType: 'image/png' }],
  }

  if (includeVrmExtension) {
    json.extensions = {
      VRM: {
        materialProperties,
      },
    }
    json.extensionsUsed = ['VRM']
  }

  return {
    json,
    buffers: [],
  } as GLTFWithBuffers
}

function createVRM0MaterialProperty(name: string, shader: string): Record<string, unknown> {
  const property: Record<string, unknown> = {
    name,
    renderQueue: 2450,
    shader,
    floatProperties: {},
    vectorProperties: {},
    textureProperties: {},
    keywordMap: {},
    tagMap: {},
  }

  if (shader === 'VRM/MToon') {
    property.textureProperties = {
      _MainTex: 0,
      _ShadeTexture: 0,
      _BumpMap: 0,
      _EmissionMap: 0,
      _RimTexture: 0,
      _OutlineWidthTexture: 0,
      _UvAnimMaskTexture: 0,
    }
  }

  return property
}

describe('ScenegraphAdapter', () => {
  it('builds atlas material descriptors from VRM 1.0 MToon materials', async () => {
    const adapterResult = ScenegraphAdapter.from(createTestGltf({ vrmVersion: '1.0' }))
    if (adapterResult.isErr()) {
      throw new Error(`Failed to create adapter: ${adapterResult.error.message}`)
    }
    const adapter = adapterResult.value
    mockImageDecoding(adapter)
    const descriptors = await adapter.createAtlasMaterialDescriptors()
    expect(descriptors).toHaveLength(1)
    expect(descriptors[0]?.textures.length).toBeGreaterThan(1)
    expect(descriptors[0]?.textures.some((texture) => texture.slot === SHADE_SLOT)).toBe(true)

    const bitmap = await descriptors[0]!.textures[0]!.readImageData()
    expect(bitmap).toBeInstanceOf(Uint8ClampedArray)
    expect(bitmap.length).toBeGreaterThan(0)
  })

  it('applies atlas result and updates VRM 1.0 extension textures', async () => {
    const adapterResult = ScenegraphAdapter.from(createTestGltf({ vrmVersion: '1.0' }))
    if (adapterResult.isErr()) {
      throw new Error(`Failed to create adapter: ${adapterResult.error.message}`)
    }
    const adapter = adapterResult.value
    const originalTextureCount = adapter.unwrap().json.textures?.length ?? 0
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
        {
          slot: SHADE_SLOT,
          atlasImage: Uint8Array.from([3, 2, 1, 0]),
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
    const shadeIndex =
      scenegraph.json.materials?.[0]?.extensions?.VRMC_materials_mtoon?.shadeMultiplyTexture?.index

    const finalTextureCount = scenegraph.json.textures?.length ?? 0
    expect(finalTextureCount).toBeGreaterThan(originalTextureCount)
    expect(typeof baseColorIndex).toBe('number')
    expect(typeof shadeIndex).toBe('number')
    expect(scenegraph.json.images).toHaveLength(finalTextureCount)
  })

  it('updates VRM 0.x material properties when atlas assignments are flushed', async () => {
    const adapterResult = ScenegraphAdapter.from(createTestGltf({ vrmVersion: '0.x' }))
    if (adapterResult.isErr()) {
      throw new Error(`Failed to create adapter: ${adapterResult.error.message}`)
    }
    const adapter = adapterResult.value
    const originalTextureCount = adapter.unwrap().json.textures?.length ?? 0
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
        {
          slot: SHADE_SLOT,
          atlasImage: Uint8Array.from([3, 2, 1, 0]),
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
    const vrmMaterial =
      scenegraph.json.extensions?.VRM?.materialProperties?.[0]?.textureProperties

    const finalTextureCount = scenegraph.json.textures?.length ?? 0
    expect(finalTextureCount).toBeGreaterThanOrEqual(originalTextureCount)
    const baseColorIndex =
      scenegraph.json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture?.index
    expect(typeof baseColorIndex).toBe('number')
    expect(vrmMaterial?._MainTex).toBe(baseColorIndex)
    expect(typeof vrmMaterial?._ShadeTexture).toBe('number')
  })

  it('skips non-MToon materials when building descriptors', async () => {
    const adapterResult = ScenegraphAdapter.from(
      createTestGltf({ vrmVersion: '1.0', includeNonMToonMaterial: true }),
    )
    if (adapterResult.isErr()) {
      throw new Error(`Failed to create adapter: ${adapterResult.error.message}`)
    }
    const adapter = adapterResult.value
    mockImageDecoding(adapter)
    const descriptors = await adapter.createAtlasMaterialDescriptors()
    expect(descriptors).toHaveLength(1)
  })

  it('identifies VRM 0.x documents', () => {
    const adapterResult = ScenegraphAdapter.from(createTestGltf({ vrmVersion: '0.x' }))
    if (adapterResult.isErr()) {
      throw new Error(`Expected VRM 0.x adapter, got error: ${adapterResult.error.message}`)
    }
    expect(adapterResult.value.getVRMMajorVersion()).toBe('0.x')
    expect(adapterResult.value.isVRM0()).toBe(true)
    expect(adapterResult.value.isVRM10()).toBe(false)
  })

  it('identifies VRM 1.0 documents', () => {
    const adapterResult = ScenegraphAdapter.from(createTestGltf({ vrmVersion: '1.0' }))
    if (adapterResult.isErr()) {
      throw new Error(`Expected VRM 1.0 adapter, got error: ${adapterResult.error.message}`)
    }
    expect(adapterResult.value.getVRMMajorVersion()).toBe('1.0')
    expect(adapterResult.value.isVRM0()).toBe(false)
    expect(adapterResult.value.isVRM10()).toBe(true)
  })

  it('rejects documents without VRM extensions', () => {
    const adapterResult = ScenegraphAdapter.from(createTestGltf({ includeVrmExtension: false }))
    expect(adapterResult.isErr()).toBe(true)
    if (adapterResult.isOk()) {
      throw new Error('Expected adapter creation to fail for non-VRM document')
    }
    expect(adapterResult.error.type).toBe('UNSUPPORTED_VRM_VERSION')
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
