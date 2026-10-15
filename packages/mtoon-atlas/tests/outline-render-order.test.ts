import { Mesh, Object3D } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { MToonAtlasLoaderPlugin } from '../src/extensions/MToonAtlasLoaderPlugin'
import { MToonAtlasMaterial } from '../src/MToonAtlasMaterial'

/**
 * アウトラインメッシュの描画順（issue #66）
 *
 * renderOrder は glTF に保存されないため、再読み込み後に透明グループの
 * アウトライン（BackSide・黒）が本体の後に描かれて髪が真っ黒になる。
 * ローダーの afterRoot で isOutline のメッシュだけ renderOrder を下げる
 */
describe('MToonAtlasLoaderPlugin.afterRoot', () =>
{
  function createPlugin(): MToonAtlasLoaderPlugin
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new MToonAtlasLoaderPlugin({ json: {} } as any)
  }

  function runAfterRoot(scene: Object3D): void
  {
    createPlugin().afterRoot({ scene } as unknown as GLTF)
  }

  it('アウトラインのメッシュだけ renderOrder を本体より下げる', () =>
  {
    const scene = new Object3D()
    const mainMesh = new Mesh(undefined, new MToonAtlasMaterial())
    const outlineMesh = new Mesh(
      undefined,
      (mainMesh.material as MToonAtlasMaterial).createOutlineMaterial(),
    )
    // 再読み込み直後の状態（両方 0）
    scene.add(mainMesh, outlineMesh)

    runAfterRoot(scene)

    expect(mainMesh.renderOrder).toBe(0)
    expect(outlineMesh.renderOrder).toBe(-1)
    expect(outlineMesh.renderOrder).toBeLessThan(mainMesh.renderOrder)
  })

  it('マテリアル配列に outline が含まれていれば下げる', () =>
  {
    const scene = new Object3D()
    const base = new MToonAtlasMaterial()
    const mesh = new Mesh(undefined, [base, base.createOutlineMaterial()])
    scene.add(mesh)

    runAfterRoot(scene)

    expect(mesh.renderOrder).toBe(-1)
  })

  it('MToonAtlasMaterial 以外のメッシュには触らない', () =>
  {
    const scene = new Object3D()
    const mesh = new Mesh()
    mesh.renderOrder = 3
    scene.add(mesh)

    runAfterRoot(scene)

    expect(mesh.renderOrder).toBe(3)
  })
})
