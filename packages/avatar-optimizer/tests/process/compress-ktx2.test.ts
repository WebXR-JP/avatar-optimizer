import type { VRM } from '@pixiv/three-vrm'
import { MToonMaterial } from '@pixiv/three-vrm'
import { resolveKtx2Loader } from '@webxr-jp/mtoon-atlas'
import { getKtx2Source, rememberKtx2Source } from '@webxr-jp/mtoon-atlas'
import {
  BufferGeometry,
  CompressedTexture,
  DataTexture,
  Float32BufferAttribute,
  Mesh,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from 'three'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import {
  compressAtlasTexturesToKtx2,
  resolveKtx2LoaderForOptimization,
} from '../../src/process/compress-ktx2'
import type { AtlasImageMap } from '../../src/types'
import type { MaterialInfo } from '../../src/util/material/types'

vi.mock('@webxr-jp/mtoon-atlas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@webxr-jp/mtoon-atlas')>()
  return {
    ...actual,
    resolveKtx2Loader: vi.fn(actual.resolveKtx2Loader),
  }
})

function createMinimalAtlasMap(baseTex: Texture): AtlasImageMap {
  const dummy = () =>
    new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat)
  return {
    map: baseTex,
    normalMap: dummy(),
    emissiveMap: dummy(),
    shadeMultiplyTexture: dummy(),
    shadingShiftTexture: dummy(),
    matcapTexture: dummy(),
    rimMultiplyTexture: dummy(),
    outlineWidthMultiplyTexture: dummy(),
    uvAnimationMaskTexture: dummy(),
  }
}

function createSolidDataTexture(name: string, r = 255): DataTexture {
  const data = new Uint8Array(4 * 4 * 4)
  for (let i = 0; i < 16; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = 128
    data[i * 4 + 2] = 64
    data[i * 4 + 3] = 255
  }
  const tex = new DataTexture(data, 4, 4, RGBAFormat, UnsignedByteType)
  tex.name = name
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function createDummyCompressedTexture(name: string): CompressedTexture {
  const mipmaps = [{ data: new Uint8Array(8), width: 4, height: 4 }]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tex = new CompressedTexture(mipmaps as any, 4, 4)
  tex.name = name
  return tex
}

function createSimpleVrmWithMToon(): { vrm: VRM; material: MToonMaterial } {
  const scene = new Scene()
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  )
  geometry.setAttribute(
    'normal',
    new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
  )
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2))

  const material = new MToonMaterial()
  material.name = 'testMat'
  material.map = createSolidDataTexture('origMap')
  const mesh = new Mesh(geometry, material)
  mesh.name = 'testMesh'
  scene.add(mesh)

  const vrm = { scene } as unknown as VRM
  return { vrm, material }
}

describe('compress-ktx2', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolveKtx2Loader が null を返す場合に INTERNAL_ERROR になり、optimizeModel がモデルを変更せずに失敗する', async () => {
    vi.mocked(resolveKtx2Loader).mockReturnValueOnce(null)
    const { vrm, material } = createSimpleVrmWithMToon()
    const originalChildCount = vrm.scene.children.length
    const originalMap = material.map

    const loaderRes = resolveKtx2LoaderForOptimization({})
    expect(loaderRes.isErr()).toBe(true)
    if (loaderRes.isErr()) {
      expect(loaderRes.error.type).toBe('INTERNAL_ERROR')
    }

    vi.mocked(resolveKtx2Loader).mockReturnValueOnce(null)
    const optRes = await optimizeModel(vrm, {
      textureCompression: { supercompression: true },
    })

    expect(optRes.isErr()).toBe(true)
    if (optRes.isErr()) {
      expect(optRes.error.type).toBe('INTERNAL_ERROR')
    }
    // モデルが無傷（元のマテリアルとメッシュがそのまま）であること
    expect(vrm.scene.children.length).toBe(originalChildCount)
    expect((vrm.scene.children[0] as Mesh).material).toBe(material)
    expect(material.map).toBe(originalMap)
  })

  it('既に rememberKtx2Source 済みのテクスチャは再圧縮せずそのまま保持する', async () => {
    const ktx2Tex = createDummyCompressedTexture('alreadyKtx2')
    const rawBytes = new Uint8Array([
      0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    rememberKtx2Source(ktx2Tex, rawBytes)

    const material = new MToonMaterial()
    material.map = ktx2Tex
    const materialInfos: MaterialInfo[] = [
      {
        material,
        meshes: [],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
    ]

    const atlasMap = createMinimalAtlasMap(ktx2Tex)
    // 他のスロットは null にして map のみを検証
    material.normalMap = null
    material.emissiveMap = null
    material.shadeMultiplyTexture = null
    material.shadingShiftTexture = null
    material.matcapTexture = null
    material.rimMultiplyTexture = null
    material.uvAnimationMaskTexture = null

    const mockLoader = { parse: vi.fn() } as unknown as KTX2Loader
    const result = await compressAtlasTexturesToKtx2(materialInfos, atlasMap, {
      compression: { supercompression: true },
      ktx2Loader: mockLoader,
    })

    expect(result.isOk()).toBe(true)
    expect(mockLoader.parse).not.toHaveBeenCalled()
    expect(material.map).toBe(ktx2Tex)
    expect(getKtx2Source(material.map!)).toEqual(rawBytes)
  })

  it('元バイナリ不明の CompressedTexture に対して ASSET_ERROR で失敗する', async () => {
    const unknownCompressed = createDummyCompressedTexture('foreign')
    const material = new MToonMaterial()
    material.map = unknownCompressed
    const materialInfos: MaterialInfo[] = [
      {
        material,
        meshes: [],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
    ]

    const mockLoader = { parse: vi.fn() } as unknown as KTX2Loader
    const result = await compressAtlasTexturesToKtx2(
      materialInfos,
      createMinimalAtlasMap(unknownCompressed),
      {
        compression: { supercompression: true },
        ktx2Loader: mockLoader,
      },
    )

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.type).toBe('ASSET_ERROR')
      expect(result.error.message).toContain('foreign')
    }
    expect(mockLoader.parse).not.toHaveBeenCalled()
  })

  it('途中失敗時に途中まで作成した CompressedTexture が dispose() される', async () => {
    const firstTex = createSolidDataTexture('firstAtlas', 200)
    const secondTex = createSolidDataTexture('secondAtlas', 100)

    const material = new MToonMaterial()
    material.map = firstTex
    material.normalMap = secondTex
    const materialInfos: MaterialInfo[] = [
      {
        material,
        meshes: [],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
    ]

    const atlasMap = createMinimalAtlasMap(firstTex)
    atlasMap.normalMap = secondTex

    const createdFirst = createDummyCompressedTexture('transcodedFirst')
    const disposeSpy = vi.spyOn(createdFirst, 'dispose')

    let callCount = 0
    const mockLoader = {
      parse: vi.fn(
        (
          _buf: ArrayBuffer,
          onLoad: (tex: CompressedTexture) => void,
          onError: (err: unknown) => void,
        ) => {
          callCount++
          if (callCount === 1) {
            onLoad(createdFirst)
          } else {
            onError(new Error('transcode boom'))
          }
        },
      ),
    } as unknown as KTX2Loader

    const result = await compressAtlasTexturesToKtx2(materialInfos, atlasMap, {
      compression: { supercompression: true },
      ktx2Loader: mockLoader,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.type).toBe('INTERNAL_ERROR')
    }
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    // 失敗時は元のマテリアル上のテクスチャが書き換わっていないこと
    expect(material.map).toBe(firstTex)
    expect(material.normalMap).toBe(secondTex)
  })

  it('ktx2Loader が null のときはトランスコードせず、元のテクスチャに KTX2 バイナリを記録する', async () => {
    const atlasTex = createSolidDataTexture('rawAtlas')
    const material = new MToonMaterial()
    material.map = atlasTex
    const materialInfos: MaterialInfo[] = [
      {
        material,
        meshes: [],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
    ]

    const result = await compressAtlasTexturesToKtx2(
      materialInfos,
      createMinimalAtlasMap(atlasTex),
      { compression: { supercompression: true }, ktx2Loader: null },
    )

    expect(result.isOk()).toBe(true)
    expect(material.map).toBe(atlasTex)
    const ktx2Source = getKtx2Source(atlasTex)
    expect(ktx2Source).toBeDefined()
    expect(Array.from(ktx2Source!.subarray(0, 4))).toEqual([
      0xab, 0x4b, 0x54, 0x58,
    ])
  })

  it('ktx2Transcode: false のときは KTX2Loader を解決しない', async () => {
    vi.mocked(resolveKtx2Loader).mockClear()
    const { vrm } = createSimpleVrmWithMToon()
    await optimizeModel(vrm, {
      textureCompression: { supercompression: true },
      ktx2Transcode: false,
    })
    expect(resolveKtx2Loader).not.toHaveBeenCalled()
  })

  it('MToonMaterial がないモデル（atlasSkipped）に textureCompression を渡してもエラーにならずスキップされる', async () => {
    const scene = new Scene()
    const vrm = { scene } as unknown as VRM

    const result = await optimizeModel(vrm, {
      textureCompression: { supercompression: true },
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.atlasSkipped?.reason).toBe('NO_MTOON_MATERIAL')
    }
  })
})
