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
import { MToonAtlasMaterial } from '../src/MToonAtlasMaterial'
import { MToonAtlasNodeMaterial } from '../src/nodes'
import { MToonAtlasExporterPlugin } from '../src/extensions/MToonAtlasExporterPlugin'
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
