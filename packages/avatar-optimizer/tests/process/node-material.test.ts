/**
 * TSL 版 MToon（three-vrm の MToonNodeMaterial）を最適化できることのテスト
 *
 * WebGPURenderer 向けに読み込んだ VRM は MToonMaterial ではなく
 * MToonNodeMaterial を持つ。判定・集計・統合がこれを扱えること、
 * 生成するアトラスマテリアルを MToonAtlasNodeMaterial にできることを確認する。
 */

import { MToonMaterial, type VRM } from '@pixiv/three-vrm'
import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes'
import { MToonAtlasMaterial } from '@webxr-jp/mtoon-atlas'
import { MToonAtlasNodeMaterial } from '@webxr-jp/mtoon-atlas/nodes'
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import { describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import {
  getMToonMaterialInfoFromObject3D,
  isMToonLikeMaterial,
} from '../../src/util/material'
import { combineMToonMaterials } from '../../src/util/material/combine'

function createGeometry(z = 0): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]), 3),
  )
  geometry.setAttribute(
    'normal',
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  )
  geometry.setAttribute(
    'uv',
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2),
  )
  return geometry
}

/**
 * three-vrm と同じく、アウトラインありの MToon を [本体, アウトライン] の配列で持つメッシュを作る
 */
function createOutlinedMesh(material: MToonNodeMaterial, z = 0): Mesh {
  material.outlineWidthMode = 'worldCoordinates'
  material.outlineWidthFactor = 0.01
  const outline = material.clone()
  outline.isOutline = true
  outline.side = BackSide
  const geometry = createGeometry(z)
  geometry.addGroup(0, 3, 0)
  geometry.addGroup(0, 3, 1)
  return new Mesh(geometry, [material, outline])
}

describe('isMToonLikeMaterial', () => {
  it('MToonMaterial と MToonNodeMaterial を MToon として扱う', () => {
    expect(isMToonLikeMaterial(new MToonMaterial())).toBe(true)
    expect(isMToonLikeMaterial(new MToonNodeMaterial())).toBe(true)
  })

  it('MToon 以外は扱わない', () => {
    expect(isMToonLikeMaterial(new MeshStandardMaterial())).toBe(false)
    expect(isMToonLikeMaterial(new MToonAtlasNodeMaterial())).toBe(false)
    expect(isMToonLikeMaterial(null)).toBe(false)
    expect(isMToonLikeMaterial(undefined)).toBe(false)
  })
})

describe('getMToonMaterialInfoFromObject3D with MToonNodeMaterial', () => {
  it('単体・アウトライン付き配列のどちらのメッシュも集計する', () => {
    const root = new Group()
    const plain = new MToonNodeMaterial()
    const outlined = new MToonNodeMaterial({
      transparent: true,
      depthWrite: true,
    })
    root.add(new Mesh(createGeometry(), plain))
    root.add(createOutlinedMesh(outlined, 1))
    root.add(new Mesh(createGeometry(2), new MeshStandardMaterial()))

    const result = getMToonMaterialInfoFromObject3D(root)
    expect(result.isOk()).toBe(true)
    const infos = result._unsafeUnwrap()

    expect(infos.map((info) => info.material)).toEqual([plain, outlined])
    const outlinedInfo = infos.find((info) => info.material === outlined)!
    expect(outlinedInfo.hasOutline).toBe(true)
    expect(outlinedInfo.outlineWidthMode).toBe('worldCoordinates')
    expect(outlinedInfo.renderMode).toBe('transparentZWrite')
  })
})

describe('combineMToonMaterials with materialType', () => {
  it('MToonAtlasNodeMaterial を指定すると本体・アウトラインとも TSL 版で統合する', () => {
    const material = new MToonNodeMaterial()
    const mesh1 = createOutlinedMesh(material)
    const mesh2 = new Mesh(createGeometry(1), material)

    const result = combineMToonMaterials(
      [
        {
          material,
          meshes: [mesh1, mesh2],
          hasOutline: true,
          outlineWidthMode: 'screenCoordinates',
          renderMode: 'opaque',
        },
      ],
      { materialType: MToonAtlasNodeMaterial },
    )

    expect(result.isOk()).toBe(true)
    const group = result._unsafeUnwrap().groups.get('opaque')!
    expect(group.material).toBeInstanceOf(MToonAtlasNodeMaterial)
    expect(group.outlineMaterial).toBeInstanceOf(MToonAtlasNodeMaterial)
    expect(group.outlineMaterial!.isOutline).toBe(true)
    expect(group.outlineMaterial!.outlineWidthMode).toBe('screenCoordinates')
    // TSL 版は DataTexture を作らず parameterBuffer を直接受け取る
    expect(group.material.parameterTexture).toBeUndefined()
    expect(group.material.parameterBuffer?.slotCount).toBe(1)
    expect(group.material.parameterBuffer?.texelsPerSlot).toBe(9)
    expect(group.material.parameterBuffer?.data).toBeInstanceOf(Float32Array)
  })

  it('MToonAtlasNodeMaterial で UBO 上限を超えるマテリアル数はエラーを返す', () => {
    const materialInfos = Array.from({ length: 114 }, (_, i) => {
      const mat = new MToonNodeMaterial({ name: `mat_${i}` })
      return {
        material: mat,
        meshes: [new Mesh(createGeometry(i), mat)],
        hasOutline: false,
        outlineWidthMode: 'none' as const,
        renderMode: 'opaque' as const,
      }
    })

    const result = combineMToonMaterials(materialInfos, {
      materialType: MToonAtlasNodeMaterial,
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().type).toBe('PARAMETER_TEXTURE_FAILED')
    expect(result._unsafeUnwrapErr().message).toContain('UBO 上限')
  })

  it('alphaTest グループでも TSL 版を作れる（GLSL 版専用の updateDefines を呼ばない）', () => {
    const material = new MToonNodeMaterial({ alphaTest: 0.5 })
    const result = combineMToonMaterials(
      [
        {
          material,
          meshes: [new Mesh(createGeometry(), material)],
          hasOutline: false,
          outlineWidthMode: 'none',
          renderMode: 'alphaTest',
        },
      ],
      { materialType: MToonAtlasNodeMaterial },
    )

    expect(result.isOk()).toBe(true)
    const group = result._unsafeUnwrap().groups.get('alphaTest')!
    expect(group.material).toBeInstanceOf(MToonAtlasNodeMaterial)
    expect(group.material.alphaTest).toBe(0.5)
  })

  it('省略時は従来どおり MToonAtlasMaterial を作る', () => {
    const material = new MToonMaterial()
    const result = combineMToonMaterials(
      [
        {
          material,
          meshes: [new Mesh(createGeometry(), material)],
          hasOutline: false,
          outlineWidthMode: 'none',
          renderMode: 'opaque',
        },
      ],
      {},
    )

    expect(result.isOk()).toBe(true)
    expect(
      result._unsafeUnwrap().groups.get('opaque')!.material,
    ).toBeInstanceOf(MToonAtlasMaterial)
  })
})

describe('optimizeModel with MToonNodeMaterial', () => {
  it('atlasMaterialType を省略するとモデルを変更せずに INVALID_PARAMETER を返す', async () => {
    const root = new Group()
    const mesh = new Mesh(createGeometry(), new MToonNodeMaterial())
    root.add(mesh)
    const vrm = { scene: root } as unknown as VRM

    const result = await optimizeModel(vrm)

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().type).toBe('INVALID_PARAMETER')
    expect(result._unsafeUnwrapErr().message).toContain(
      'MToonAtlasNodeMaterial',
    )
    // 統合も UV 書き換えも行われていない
    expect(root.children).toEqual([mesh])
    expect(mesh.material).toBeInstanceOf(MToonNodeMaterial)
  })
})
