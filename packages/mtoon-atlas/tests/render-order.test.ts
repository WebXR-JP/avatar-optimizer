import { Mesh, Object3D } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { MToonAtlasLoaderPlugin } from '../src/extensions/MToonAtlasLoaderPlugin'
import { MToonAtlasMaterial } from '../src/MToonAtlasMaterial'
import {
  MTOON_TRANSPARENT_RENDER_ORDER,
  MTOON_TRANSPARENT_ZWRITE_RENDER_ORDER,
} from '../src/render-order'

/**
 * 半透明メッシュの描画順（three-vrm と同じ規則）
 *
 * three-vrm は深度書き込みありの半透明を 0、なしを 19 の renderOrder で描く。
 * renderOrder は glTF に保存されないので、ローダーの afterRoot で同じ規則を適用する
 */
describe('MToonAtlasLoaderPlugin.afterRoot', () =>
{
  function runAfterRoot(scene: Object3D): void
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new MToonAtlasLoaderPlugin({ json: {} } as any).afterRoot({ scene } as unknown as GLTF)
  }

  function transparentMaterial(depthWrite: boolean): MToonAtlasMaterial
  {
    const material = new MToonAtlasMaterial()
    material.transparent = true
    material.depthWrite = depthWrite
    return material
  }

  it('深度書き込みなしの半透明は renderOrder 19、ありは 0 にする', () =>
  {
    const scene = new Object3D()
    const zwrite = new Mesh(undefined, transparentMaterial(true))
    const plain = new Mesh(undefined, transparentMaterial(false))
    scene.add(zwrite, plain)

    runAfterRoot(scene)

    expect(zwrite.renderOrder).toBe(MTOON_TRANSPARENT_ZWRITE_RENDER_ORDER)
    expect(plain.renderOrder).toBe(MTOON_TRANSPARENT_RENDER_ORDER)
    expect(zwrite.renderOrder).toBeLessThan(plain.renderOrder)
  })

  it('不透明メッシュと MToonAtlasMaterial 以外には触らない', () =>
  {
    const scene = new Object3D()
    const opaque = new Mesh(undefined, new MToonAtlasMaterial())
    opaque.renderOrder = 3
    const other = new Mesh()
    other.renderOrder = 5
    scene.add(opaque, other)

    runAfterRoot(scene)

    expect(opaque.renderOrder).toBe(3)
    expect(other.renderOrder).toBe(5)
  })

  it('マテリアル配列は先頭（本体）の設定で判定する', () =>
  {
    const scene = new Object3D()
    const base = transparentMaterial(false)
    const mesh = new Mesh(undefined, [base, base.createOutlineMaterial()])
    scene.add(mesh)

    runAfterRoot(scene)

    expect(mesh.renderOrder).toBe(MTOON_TRANSPARENT_RENDER_ORDER)
  })
})
