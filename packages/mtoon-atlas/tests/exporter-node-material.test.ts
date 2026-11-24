/**
 * MToonAtlasExporterPlugin が GLSL 版・TSL 版の両マテリアルを書き出せることのテスト
 *
 * TSL 版（NodeMaterial）は color を持たないため、GLTFExporter 標準の
 * マテリアル変換に渡ると例外になる。プラグインがそれを避け、
 * XRIFT_mtoon_atlas のマテリアル定義を書けることを確認する。
 */

import { describe, it, expect } from 'vitest'
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  Scene,
} from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MToonAtlasMaterial } from '../src/MToonAtlasMaterial'
import { MToonAtlasNodeMaterial } from '../src/nodes'
import { MToonAtlasExporterPlugin } from '../src/extensions/MToonAtlasExporterPlugin'
import { MToonAtlasLoaderPlugin } from '../src/extensions/MToonAtlasLoaderPlugin'
import { MTOON_ATLAS_EXTENSION_NAME } from '../src/extensions/types'
import type { MToonAtlasMaterialConstructor } from '../src/types'

function createParameterTexture(): DataTexture
{
  const data = new Float32Array(9 * 2 * 4).fill(0.5)
  const texture = new DataTexture(data, 9, 2, RGBAFormat, FloatType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.needsUpdate = true
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

async function exportScene(scene: Scene): Promise<{ materials: Record<string, unknown>[], meshes: { primitives: Record<string, unknown>[] }[] }>
{
  const exporter = new GLTFExporter()
  exporter.register((writer) => new MToonAtlasExporterPlugin(writer as never) as never)
  const json = await exporter.parseAsync(scene, { binary: false })
  return json as never
}

describe.each([
  ['MToonAtlasMaterial (GLSL)', MToonAtlasMaterial as MToonAtlasMaterialConstructor],
  ['MToonAtlasNodeMaterial (TSL)', MToonAtlasNodeMaterial as MToonAtlasMaterialConstructor],
])('MToonAtlasExporterPlugin with %s', (_label, MaterialType) =>
{
  it('XRIFT_mtoon_atlas のマテリアル定義を書き出す', async () =>
  {
    const material = new MaterialType({
      parameterTexture: { texture: createParameterTexture(), slotCount: 2, texelsPerSlot: 9 },
      name: 'atlas',
    })
    material.transparent = true
    material.depthWrite = true

    const outline = new MaterialType({
      parameterTexture: { texture: createParameterTexture(), slotCount: 2, texelsPerSlot: 9 },
      name: 'atlas (Outline)',
    })
    outline.isOutline = true
    outline.outlineWidthMode = 'screenCoordinates'

    const scene = new Scene()
    scene.add(new Mesh(createGeometry(), material))
    scene.add(new Mesh(createGeometry(), outline))

    const json = await exportScene(scene)

    // 標準変換を通っていれば pbrMetallicRoughness だけの定義が混ざる
    expect(json.materials).toHaveLength(2)
    const [body, outlineDef] = json.materials as {
      name: string
      alphaMode?: string
      extensions: Record<string, { isOutline?: boolean, outlineWidthMode?: string, transparentWithZWrite?: boolean, parameterTexture: { slotCount: number, texelsPerSlot: number } }>
    }[]

    expect(body.name).toBe('atlas')
    expect(body.alphaMode).toBe('BLEND')
    const bodyExt = body.extensions[MTOON_ATLAS_EXTENSION_NAME]
    expect(bodyExt.parameterTexture).toMatchObject({ slotCount: 2, texelsPerSlot: 9 })
    expect(bodyExt.transparentWithZWrite).toBe(true)

    const outlineExt = outlineDef.extensions[MTOON_ATLAS_EXTENSION_NAME]
    expect(outlineExt.isOutline).toBe(true)
    expect(outlineExt.outlineWidthMode).toBe('screenCoordinates')

    // 各メッシュのプリミティブが自前のマテリアル定義とスロット属性を参照する
    for (const mesh of json.meshes)
    {
      expect(typeof mesh.primitives[0].material).toBe('number')
      expect((mesh.primitives[0].attributes as Record<string, number>)._MTOON_MATERIAL_SLOT).toBeDefined()
    }
  })
})

describe('MToonAtlasExporterPlugin と parameterBuffer', () =>
{
  it('DataTexture を使わず parameterBuffer から書き出し、本体とアウトラインで共有キャッシュする', async () =>
  {
    const data = new Float32Array(9 * 2 * 4).fill(0.5)
    const body = new MToonAtlasNodeMaterial({
      parameterBuffer: { data, slotCount: 2, texelsPerSlot: 9 },
      name: 'buffer-atlas',
    })
    const outline = body.createOutlineMaterial('worldCoordinates')
    outline.name = 'buffer-atlas (Outline)'

    const scene = new Scene()
    scene.add(new Mesh(createGeometry(), body))
    scene.add(new Mesh(createGeometry(), outline))

    const json = await exportScene(scene) as unknown as {
      materials: {
        name: string
        extensions: Record<string, { parameterTexture: { index: number, slotCount: number, texelsPerSlot: number } }>
      }[]
      textures: unknown[]
    }

    expect(json.materials).toHaveLength(2)
    const bodyExt = json.materials[0].extensions[MTOON_ATLAS_EXTENSION_NAME]
    const outlineExt = json.materials[1].extensions[MTOON_ATLAS_EXTENSION_NAME]
    expect(bodyExt.parameterTexture).toMatchObject({ slotCount: 2, texelsPerSlot: 9 })
    expect(bodyExt.parameterTexture.index).toBeGreaterThanOrEqual(0)
    // 同じ Float32Array を参照する本体とアウトラインで 1 つのテクスチャ定義を共有する
    expect(outlineExt.parameterTexture.index).toBe(bodyExt.parameterTexture.index)
    expect(json.textures).toHaveLength(1)
  })

  it('GLB エクスポート → MToonAtlasLoaderPlugin で MToonAtlasNodeMaterial として parameterBuffer へ復元できる', async () =>
  {
    const data = new Float32Array(9 * 2 * 4)
    // slot 0: baseColor = (0.2, 0.4, 0.6), opacity = 1.0
    data[0] = 0.2
    data[1] = 0.4
    data[2] = 0.6
    data[3] = 1.0
    // slot 1: baseColor = (0.8, 0.5, 0.25), opacity = 0.75
    const s1 = 9 * 4
    data[s1 + 0] = 0.8
    data[s1 + 1] = 0.5
    data[s1 + 2] = 0.25
    data[s1 + 3] = 0.75

    const body = new MToonAtlasNodeMaterial({
      parameterBuffer: { data, slotCount: 2, texelsPerSlot: 9 },
      name: 'roundtrip-atlas',
    })
    const scene = new Scene()
    scene.add(new Mesh(createGeometry(), body))

    const exporter = new GLTFExporter()
    exporter.register((writer) => new MToonAtlasExporterPlugin(writer as never) as never)
    const glb = await exporter.parseAsync(scene, { binary: true }) as ArrayBuffer

    const loader = new GLTFLoader()
    loader.register((parser) => new MToonAtlasLoaderPlugin(parser as never, {
      materialType: MToonAtlasNodeMaterial,
    }) as never)

    const loaded = await new Promise<{ scene: Scene }>((resolve, reject) =>
    {
      loader.parse(glb, '', resolve, reject)
    })

    let loadedMat: MToonAtlasNodeMaterial | null = null
    loaded.scene.traverse((obj) =>
    {
      if (obj instanceof Mesh && obj.material instanceof MToonAtlasNodeMaterial)
      {
        loadedMat = obj.material
      }
    })

    expect(loadedMat).not.toBeNull()
    const mat = loadedMat!
    expect(mat.parameterTexture).toBeUndefined()
    expect(mat.parameterBuffer).toBeDefined()
    expect(mat.parameterBuffer?.slotCount).toBe(2)
    expect(mat.parameterBuffer?.texelsPerSlot).toBe(9)
    expect(mat.parameterBucketSlots).toBe(8)
    expect(mat.parameterBufferData[0]).toBeCloseTo(0.2, 4)
    expect(mat.parameterBufferData[1]).toBeCloseTo(0.4, 4)
    expect(mat.parameterBufferData[2]).toBeCloseTo(0.6, 4)
    expect(mat.parameterBufferData[3]).toBeCloseTo(1.0, 4)
    expect(mat.parameterBufferData[s1 + 0]).toBeCloseTo(0.8, 4)
    expect(mat.parameterBufferData[s1 + 1]).toBeCloseTo(0.5, 4)
    expect(mat.parameterBufferData[s1 + 2]).toBeCloseTo(0.25, 4)
    expect(mat.parameterBufferData[s1 + 3]).toBeCloseTo(0.75, 4)
  })
})

describe('MToonAtlasExporterPlugin と通常のマテリアル', () =>
{
  it('アトラス以外のマテリアルは GLTFExporter 標準の変換で書き出す', async () =>
  {
    const scene = new Scene()
    scene.add(new Mesh(createGeometry(), new MeshStandardMaterial({ name: 'standard' })))
    scene.add(new Mesh(createGeometry(), new MToonAtlasNodeMaterial({
      parameterTexture: { texture: createParameterTexture(), slotCount: 2, texelsPerSlot: 9 },
      name: 'atlas',
    })))

    const json = await exportScene(scene)
    const names = (json.materials as { name?: string, pbrMetallicRoughness?: unknown }[]).map((m) => m.name)
    expect(names).toContain('standard')
    expect(names).toContain('atlas')
    const standard = (json.materials as { name?: string, pbrMetallicRoughness?: unknown }[]).find((m) => m.name === 'standard')
    expect(standard?.pbrMetallicRoughness).toBeDefined()
  })
})
