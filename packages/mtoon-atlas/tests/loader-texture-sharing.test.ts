/**
 * MToonAtlasLoaderPlugin のテクスチャ・パラメータ共有テスト
 *
 * WebGPURenderer は THREE.Texture インスタンス単位で GPU リソースを管理するため、
 * マテリアルごとに clone() すると同じアトラステクスチャがマテリアル数倍に増殖する。
 * 同一条件のアトラステクスチャ／パラメータデータが全マテリアルで共有されることを検証する。
 */

import { describe, it, expect, vi } from 'vitest'
import { encode as encodePng16 } from 'fast-png'
import {
  BufferAttribute,
  BufferGeometry,
  CompressedTexture,
  DataTexture,
  LinearSRGBColorSpace,
  Mesh,
  NoColorSpace,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MToonAtlasMaterial } from '../src/MToonAtlasMaterial'
import { MToonAtlasNodeMaterial } from '../src/nodes'
import { MToonAtlasExporterPlugin } from '../src/extensions/MToonAtlasExporterPlugin'
import { MToonAtlasLoaderPlugin } from '../src/extensions/MToonAtlasLoaderPlugin'
import { getKtx2Source, rememberKtx2Source } from '../src/extensions/ktx2-source-cache'
import { MTOON_ATLAS_EXTENSION_NAME } from '../src/extensions/types'
import type { MToonAtlasMaterialConstructor } from '../src/types'

/** 16bit PNG バイナリ（ArrayBuffer）を作成する */
function createParameterPngBuffer(slotCount = 2, texelsPerSlot = 9): ArrayBuffer
{
  const data = new Uint16Array(slotCount * texelsPerSlot * 4)
  // slot 0: baseColor = (0.2, 0.4, 0.6), opacity = 1.0
  data[0] = Math.round(0.2 * 65535)
  data[1] = Math.round(0.4 * 65535)
  data[2] = Math.round(0.6 * 65535)
  data[3] = 65535
  // slot 1: baseColor = (0.8, 0.5, 0.25), opacity = 0.75
  const s1 = texelsPerSlot * 4
  data[s1 + 0] = Math.round(0.8 * 65535)
  data[s1 + 1] = Math.round(0.5 * 65535)
  data[s1 + 2] = Math.round(0.25 * 65535)
  data[s1 + 3] = Math.round(0.75 * 65535)

  const encoded = encodePng16({
    width: texelsPerSlot,
    height: slotCount,
    depth: 16,
    channels: 4,
    data,
  })
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer
}

function createDummyKtx2Binary(): Uint8Array
{
  const identifier = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]
  return new Uint8Array([...identifier, 1, 2, 3, 4])
}

function createCompressedTexture(colorSpace: string, name = 'atlas'): CompressedTexture
{
  const mipmaps = [{ data: new Uint8Array(8), width: 4, height: 4 }]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const texture = new CompressedTexture(mipmaps as any, 4, 4)
  texture.colorSpace = colorSpace
  texture.name = name
  return texture
}

function createGeometry(): BufferGeometry
{
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2))
  geometry.setAttribute('mtoonMaterialSlot', new BufferAttribute(new Float32Array([0, 1, 1]), 1))
  return geometry
}

function createMaterialDef(
  name: string,
  atlasedTextures: Record<string, { index: number }>,
  paramTexIndex = 0,
  isOutline = false,
)
{
  return {
    name,
    extensions: {
      [MTOON_ATLAS_EXTENSION_NAME]: {
        version: '1.0',
        parameterTexture: {
          index: paramTexIndex,
          texelsPerSlot: 9,
          slotCount: 2,
        },
        slotAttributeName: '_MTOON_MATERIAL_SLOT',
        atlasedTextures,
        isOutline,
        outlineWidthMode: isOutline ? 'worldCoordinates' : 'none',
      },
    },
  }
}

function getMaterialMap(material: unknown, key: 'map' | 'normalMap'): Texture | null
{
  if (material instanceof MToonAtlasMaterial)
  {
    return material.uniforms[key].value
  }
  return (material as MToonAtlasNodeMaterial)[key]
}

describe('MToonAtlasLoaderPlugin のテクスチャ・パラメータ共有', () =>
{
  describe.each([
    ['MToonAtlasNodeMaterial (TSL)', MToonAtlasNodeMaterial as MToonAtlasMaterialConstructor],
    ['MToonAtlasMaterial (GLSL)', MToonAtlasMaterial as MToonAtlasMaterialConstructor],
  ])('非 KTX2 (PNG) テクスチャ共有 with %s', (_label, MaterialType) =>
  {
    it('同一 textureIndex・同一 colorSpace スロットは全マテリアルで同一 Texture インスタンスを共有し、GLTFLoader の原本を汚さない', async () =>
    {
      const originalTexture = new DataTexture(
        new Uint8Array([255, 0, 0, 255]),
        1,
        1,
        RGBAFormat,
        UnsignedByteType,
      )
      originalTexture.colorSpace = NoColorSpace
      originalTexture.flipY = true

      const paramPng = createParameterPngBuffer()
      const loadTexture = vi.fn().mockResolvedValue(originalTexture)
      const getDependency = vi.fn().mockResolvedValue(paramPng)

      const parser = {
        json: {
          textures: [
            { source: 0 }, // 0: parameter PNG
            { source: 1 }, // 1: baseColor atlas
          ],
          images: [
            { bufferView: 0 },
            { bufferView: 1 },
          ],
          materials: [
            createMaterialDef('opaque', { baseColor: { index: 1 } }, 0, false),
            createMaterialDef('opaque_outline', { baseColor: { index: 1 } }, 0, true),
            createMaterialDef('transparent', { baseColor: { index: 1 } }, 0, false),
          ],
        },
        associations: new Map(),
        loadTexture,
        getDependency,
      }

      const plugin = new MToonAtlasLoaderPlugin(parser as never, {
        materialType: MaterialType,
      })

      // GLTFLoader と同じく並列で全マテリアルを読み込む
      const materials = await Promise.all([
        plugin.loadMaterial(0)!,
        plugin.loadMaterial(1)!,
        plugin.loadMaterial(2)!,
      ])

      const map0 = getMaterialMap(materials[0], 'map')
      const map1 = getMaterialMap(materials[1], 'map')
      const map2 = getMaterialMap(materials[2], 'map')

      expect(map0).not.toBeNull()
      // 全マテリアルが厳密に同一の Texture インスタンスを共有する
      expect(map1).toBe(map0)
      expect(map2).toBe(map0)
      // GLTFLoader キャッシュの原本とは別インスタンスで、原本を汚していない
      expect(map0).not.toBe(originalTexture)
      expect(originalTexture.colorSpace).toBe(NoColorSpace)
      expect(originalTexture.flipY).toBe(true)
      // クローン側には正しい設定が適用されている
      expect(map0!.colorSpace).toBe(SRGBColorSpace)
      expect(map0!.flipY).toBe(false)
      // 初回 1 回のみ loadTexture を呼ぶ
      expect(loadTexture).toHaveBeenCalledTimes(1)
    })

    it('同一 textureIndex でも異なる colorSpace スロット間では別インスタンスになり colorSpace が衝突しない', async () =>
    {
      const originalTexture = new DataTexture(
        new Uint8Array([128, 128, 255, 255]),
        1,
        1,
        RGBAFormat,
        UnsignedByteType,
      )
      originalTexture.colorSpace = NoColorSpace

      const paramPng = createParameterPngBuffer()
      const loadTexture = vi.fn().mockResolvedValue(originalTexture)
      const getDependency = vi.fn().mockResolvedValue(paramPng)

      const parser = {
        json: {
          textures: [
            { source: 0 },
            { source: 1 },
          ],
          images: [
            { bufferView: 0 },
            { bufferView: 1 },
          ],
          materials: [
            createMaterialDef('matA', { baseColor: { index: 1 }, normal: { index: 1 } }, 0, false),
            createMaterialDef('matB', { baseColor: { index: 1 }, normal: { index: 1 } }, 0, true),
          ],
        },
        associations: new Map(),
        loadTexture,
        getDependency,
      }

      const plugin = new MToonAtlasLoaderPlugin(parser as never, {
        materialType: MaterialType,
      })

      const [matA, matB] = await Promise.all([
        plugin.loadMaterial(0)!,
        plugin.loadMaterial(1)!,
      ])

      const mapA = getMaterialMap(matA, 'map')
      const normalA = getMaterialMap(matA, 'normalMap')
      const mapB = getMaterialMap(matB, 'map')
      const normalB = getMaterialMap(matB, 'normalMap')

      expect(mapA).not.toBeNull()
      expect(normalA).not.toBeNull()
      expect(mapA).not.toBe(normalA)
      expect(mapB).toBe(mapA)
      expect(normalB).toBe(normalA)
      expect(mapA!.colorSpace).toBe(SRGBColorSpace)
      expect(normalA!.colorSpace).toBe(NoColorSpace)
    })
  })

  describe('KTX2 テクスチャ共有', () =>
  {
    it('bufferView 経由で同一 textureIndex を並列ロードしても ktx2Loader.parse は 1 回のみで同一インスタンスを共有する', async () =>
    {
      const ktx2Bytes = createDummyKtx2Binary()
      const ktx2Buffer = ktx2Bytes.buffer.slice(0)
      const paramPng = createParameterPngBuffer()

      const parsedTexture = createCompressedTexture(LinearSRGBColorSpace, 'atlasBaseColor')
      const ktx2Loader = {
        parse: vi.fn((buffer: ArrayBuffer, onLoad: (tex: CompressedTexture) => void) =>
        {
          expect(buffer.byteLength).toBe(ktx2Bytes.byteLength)
          onLoad(parsedTexture)
        }),
      }

      const parser = {
        json: {
          textures: [
            { source: 0 },
            { extensions: { KHR_texture_basisu: { source: 1 } } },
          ],
          images: [
            { bufferView: 0 },
            { bufferView: 1, mimeType: 'image/ktx2' },
          ],
          materials: [
            createMaterialDef('body', { baseColor: { index: 1 } }, 0, false),
            createMaterialDef('outline', { baseColor: { index: 1 } }, 0, true),
            createMaterialDef('hair', { baseColor: { index: 1 } }, 0, false),
          ],
        },
        associations: new Map(),
        loadTexture: vi.fn(),
        getDependency: vi.fn((type: string, index: number) =>
        {
          expect(type).toBe('bufferView')
          return Promise.resolve(index === 0 ? paramPng : ktx2Buffer)
        }),
      }

      const plugin = new MToonAtlasLoaderPlugin(parser as never, {
        ktx2Loader: ktx2Loader as never,
        materialType: MToonAtlasNodeMaterial,
      })

      const [m0, m1, m2] = await Promise.all([
        plugin.loadMaterial(0)!,
        plugin.loadMaterial(1)!,
        plugin.loadMaterial(2)!,
      ]) as MToonAtlasNodeMaterial[]

      expect(ktx2Loader.parse).toHaveBeenCalledTimes(1)
      expect(m0.map).toBe(parsedTexture)
      expect(m1.map).toBe(parsedTexture)
      expect(m2.map).toBe(parsedTexture)
      // KTX2Loader が設定した colorSpace を上書きしないこと
      expect(m0.map!.colorSpace).toBe(LinearSRGBColorSpace)
      // 元バイナリをキャッシュから引けること
      expect(getKtx2Source(m0.map!)).toEqual(ktx2Bytes)
    })

    it('data: URI 経由でも ktx2Loader.parse は 1 回のみで同一インスタンスを共有する', async () =>
    {
      const ktx2Bytes = createDummyKtx2Binary()
      const base64 = btoa(String.fromCharCode(...ktx2Bytes))
      const dataUri = `data:image/ktx2;base64,${base64}`
      const paramPng = createParameterPngBuffer()

      const parsedTexture = createCompressedTexture(SRGBColorSpace, 'atlasDataUri')
      const ktx2Loader = {
        parse: vi.fn((_buffer: ArrayBuffer, onLoad: (tex: CompressedTexture) => void) =>
        {
          onLoad(parsedTexture)
        }),
      }

      const parser = {
        json: {
          textures: [
            { source: 0 },
            { extensions: { KHR_texture_basisu: { source: 1 } } },
          ],
          images: [
            { bufferView: 0 },
            { uri: dataUri, mimeType: 'image/ktx2' },
          ],
          materials: [
            createMaterialDef('body', { baseColor: { index: 1 } }, 0, false),
            createMaterialDef('outline', { baseColor: { index: 1 } }, 0, true),
          ],
        },
        associations: new Map(),
        loadTexture: vi.fn(),
        getDependency: vi.fn().mockResolvedValue(paramPng),
      }

      const plugin = new MToonAtlasLoaderPlugin(parser as never, {
        ktx2Loader: ktx2Loader as never,
        materialType: MToonAtlasNodeMaterial,
      })

      const [m0, m1] = await Promise.all([
        plugin.loadMaterial(0)!,
        plugin.loadMaterial(1)!,
      ]) as MToonAtlasNodeMaterial[]

      expect(ktx2Loader.parse).toHaveBeenCalledTimes(1)
      expect(m0.map).toBe(parsedTexture)
      expect(m1.map).toBe(parsedTexture)
      expect(m0.map!.colorSpace).toBe(SRGBColorSpace)
      expect(getKtx2Source(m0.map!)).toEqual(ktx2Bytes)
    })
  })

  describe('パラメータデータ／パラメータテクスチャ共有', () =>
  {
    it('MToonAtlasNodeMaterial の本体とアウトラインで parameterBuffer.data を共有しつつ parameterBufferData は独立している', async () =>
    {
      const paramPng = createParameterPngBuffer()
      const getDependency = vi.fn().mockResolvedValue(paramPng)

      const parser = {
        json: {
          textures: [{ source: 0 }],
          images: [{ bufferView: 0 }],
          materials: [
            createMaterialDef('body', {}, 0, false),
            createMaterialDef('outline', {}, 0, true),
          ],
        },
        associations: new Map(),
        loadTexture: vi.fn(),
        getDependency,
      }

      const plugin = new MToonAtlasLoaderPlugin(parser as never, {
        materialType: MToonAtlasNodeMaterial,
      })

      const [body, outline] = await Promise.all([
        plugin.loadMaterial(0)!,
        plugin.loadMaterial(1)!,
      ]) as MToonAtlasNodeMaterial[]

      // PNG バッファ取得・デコードは 1 回のみ
      expect(getDependency).toHaveBeenCalledTimes(1)
      expect(body.parameterBuffer!.data).toBe(outline.parameterBuffer!.data)
      // 各マテリアルの UBO 用パディング済み配列は独立している
      expect(body.parameterBufferData).not.toBe(outline.parameterBufferData)
      expect(body.parameterBufferData).toEqual(outline.parameterBufferData)
    })

    it('MToonAtlasMaterial の本体とアウトラインで parameterTexture.texture を共有する', async () =>
    {
      const paramPng = createParameterPngBuffer()
      const getDependency = vi.fn().mockResolvedValue(paramPng)

      const parser = {
        json: {
          textures: [{ source: 0 }],
          images: [{ bufferView: 0 }],
          materials: [
            createMaterialDef('body', {}, 0, false),
            createMaterialDef('outline', {}, 0, true),
          ],
        },
        associations: new Map(),
        loadTexture: vi.fn(),
        getDependency,
      }

      const plugin = new MToonAtlasLoaderPlugin(parser as never, {
        materialType: MToonAtlasMaterial,
      })

      const [body, outline] = await Promise.all([
        plugin.loadMaterial(0)!,
        plugin.loadMaterial(1)!,
      ]) as MToonAtlasMaterial[]

      expect(getDependency).toHaveBeenCalledTimes(1)
      expect(body.parameterTexture!.texture).toBe(outline.parameterTexture!.texture)
    })
  })

  describe('エラーフォールバック', () =>
  {
    it('loadTexture が例外を投げた場合は警告を出して null 扱いで継続する', async () =>
    {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const paramPng = createParameterPngBuffer()

      const parser = {
        json: {
          textures: [{ source: 0 }, { source: 1 }],
          images: [{ bufferView: 0 }, { bufferView: 1 }],
          materials: [
            createMaterialDef('body', { baseColor: { index: 1 } }, 0, false),
            createMaterialDef('outline', { baseColor: { index: 1 } }, 0, true),
          ],
        },
        associations: new Map(),
        loadTexture: vi.fn().mockRejectedValue(new Error('decode failed')),
        getDependency: vi.fn().mockResolvedValue(paramPng),
      }

      const plugin = new MToonAtlasLoaderPlugin(parser as never, {
        materialType: MToonAtlasNodeMaterial,
      })

      const [body, outline] = await Promise.all([
        plugin.loadMaterial(0)!,
        plugin.loadMaterial(1)!,
      ]) as MToonAtlasNodeMaterial[]

      expect(body.map).toBeNull()
      expect(outline.map).toBeNull()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      warnSpy.mockRestore()
    })
  })

  describe('GLTFExporter → MToonAtlasLoaderPlugin → GLTFExporter ラウンドトリップ', () =>
  {
    it('本体とアウトラインを再読み込み後に同一テクスチャ・パラメータを共有し、再エクスポートでも重複しない', async () =>
    {
      const ktx2Bytes = createDummyKtx2Binary()
      const atlasTexture = createCompressedTexture(SRGBColorSpace, 'atlasBaseColor')
      rememberKtx2Source(atlasTexture, ktx2Bytes)

      const data = new Float32Array(9 * 2 * 4).fill(0.5)
      const body = new MToonAtlasNodeMaterial({
        parameterBuffer: {
          data,
          slotCount: 2,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: atlasTexture },
        },
        name: 'body',
      })
      const outline = body.createOutlineMaterial('worldCoordinates')
      outline.name = 'outline'

      const scene = new Scene()
      scene.add(new Mesh(createGeometry(), body))
      scene.add(new Mesh(createGeometry(), outline))

      // 1回目エクスポート（GLB）
      const exporter1 = new GLTFExporter()
      exporter1.register((writer) => new MToonAtlasExporterPlugin(writer as never) as never)
      const glb = await exporter1.parseAsync(scene, { binary: true }) as ArrayBuffer

      // ロード（KTX2Loader モック経由）
      const parsedAtlas = createCompressedTexture(SRGBColorSpace, 'atlasBaseColor')
      const mockKtx2Loader = {
        parse: vi.fn((_buffer: ArrayBuffer, onLoad: (tex: CompressedTexture) => void) =>
        {
          onLoad(parsedAtlas)
        }),
      }
      const loader = new GLTFLoader()
      loader.register((parser) => new MToonAtlasLoaderPlugin(parser as never, {
        ktx2Loader: mockKtx2Loader as never,
        materialType: MToonAtlasNodeMaterial,
      }) as never)

      const loaded = await new Promise<{ scene: Scene }>((resolve, reject) =>
      {
        loader.parse(glb, '', resolve, reject)
      })

      const loadedMaterials: MToonAtlasNodeMaterial[] = []
      loaded.scene.traverse((obj) =>
      {
        if (obj instanceof Mesh && obj.material instanceof MToonAtlasNodeMaterial)
        {
          loadedMaterials.push(obj.material)
        }
      })

      expect(loadedMaterials).toHaveLength(2)
      expect(mockKtx2Loader.parse).toHaveBeenCalledTimes(1)
      expect(loadedMaterials[0].map).toBe(loadedMaterials[1].map)
      expect(loadedMaterials[0].parameterBuffer!.data).toBe(
        loadedMaterials[1].parameterBuffer!.data,
      )

      // 2回目エクスポート（JSON で構造検査）
      const exporter2 = new GLTFExporter()
      exporter2.register((writer) => new MToonAtlasExporterPlugin(writer as never) as never)
      const reexported = await exporter2.parseAsync(loaded.scene, { binary: false }) as {
        textures: unknown[]
        images: unknown[]
        materials: unknown[]
      }

      // パラメータテクスチャ 1 枚 + アトラス 1 枚 = 合計 2 枚のまま重複しない
      expect(reexported.materials).toHaveLength(2)
      expect(reexported.textures).toHaveLength(2)
      expect(reexported.images).toHaveLength(2)
    })
  })
})
