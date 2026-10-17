import { MToonMaterial, VRM } from '@pixiv/three-vrm'
import {
  MTOON_TRANSPARENT_RENDER_ORDER,
  MTOON_TRANSPARENT_ZWRITE_RENDER_ORDER,
  MToonAtlasMaterial,
} from '@webxr-jp/mtoon-atlas'
import { Mesh } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { exportVRMToBuffer, loadVRMFromBuffer } from './helpers/vrm-roundtrip'

/**
 * 深度書き込みあり／なしの半透明が別グループとして往復すること
 *
 * AliciaSolid の半透明はすべて TransparentWithZWrite なので、1 つを
 * 深度書き込みなしに変えて両方のグループを作る
 */
describe('Transparent ZWrite roundtrip', () => {
  const VRM_FILE_PATH = '/AliciaSolid.vrm'
  let optimizedVRM: VRM
  let reloadedVRM: VRM

  interface TransparentMesh {
    name: string
    depthWrite: boolean
    renderOrder: number
    isOutline: boolean
  }

  function collectTransparentMeshes(vrm: VRM): TransparentMesh[] {
    const result: TransparentMesh[] = []
    vrm.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const material = Array.isArray(object.material)
        ? object.material[0]
        : object.material
      if (!(material instanceof MToonAtlasMaterial) || !material.transparent)
        return
      result.push({
        name: object.name,
        depthWrite: material.depthWrite,
        renderOrder: object.renderOrder,
        isOutline: material.isOutline,
      })
    })
    return result
  }

  beforeAll(async () => {
    const response = await fetch(VRM_FILE_PATH)
    const { vrm } = await loadVRMFromBuffer(await response.arrayBuffer())

    // 1 マテリアルを深度書き込みなしの半透明にする
    let switched = 0
    vrm.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      for (const material of materials) {
        if (
          material instanceof MToonMaterial &&
          material.name === 'Alicia_hair_trans' &&
          material.depthWrite
        ) {
          material.depthWrite = false
          switched++
        }
      }
    })
    expect(switched).toBeGreaterThan(0)

    const result = await optimizeModel(vrm)
    expect(result.isOk()).toBe(true)
    optimizedVRM = vrm

    const { vrm: reloaded } = await loadVRMFromBuffer(
      await exportVRMToBuffer(vrm),
    )
    reloadedVRM = reloaded
  })

  it('should create both transparent groups after optimization', () => {
    const meshes = collectTransparentMeshes(optimizedVRM)
    const names = meshes.map((m) => m.name)
    expect(names).toContain('CombinedMToonMesh_transparentZWrite')
    expect(names).toContain('CombinedMToonMesh_transparent')
  })

  it('should keep depthWrite of each transparent group through roundtrip', () => {
    const byName = (list: TransparentMesh[]) =>
      new Map(list.map((m) => [m.name, m]))
    const before = byName(collectTransparentMeshes(optimizedVRM))
    const after = byName(collectTransparentMeshes(reloadedVRM))
    expect(after.get('CombinedMToonMesh_transparentZWrite')?.depthWrite).toBe(
      true,
    )
    expect(after.get('CombinedMToonMesh_transparent')?.depthWrite).toBe(false)
    for (const [name, mesh] of before) {
      expect(after.get(name)?.depthWrite, name).toBe(mesh.depthWrite)
    }
  })

  it('should use the same renderOrder before and after roundtrip', () => {
    const expectedOrder = (mesh: TransparentMesh) =>
      mesh.depthWrite
        ? MTOON_TRANSPARENT_ZWRITE_RENDER_ORDER
        : MTOON_TRANSPARENT_RENDER_ORDER
    for (const vrm of [optimizedVRM, reloadedVRM]) {
      for (const mesh of collectTransparentMeshes(vrm)) {
        if (mesh.isOutline) continue
        expect(mesh.renderOrder, mesh.name).toBe(expectedOrder(mesh))
      }
    }
  })
})
