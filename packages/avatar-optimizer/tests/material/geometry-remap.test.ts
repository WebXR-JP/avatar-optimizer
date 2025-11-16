import { describe, expect, it } from 'vitest'
import { BufferGeometry, Float32BufferAttribute, Matrix3, Mesh, Object3D } from 'three'
import { MToonMaterial } from '@pixiv/three-vrm'
import { __applyPlacementsToGeometries } from '../../src/material/index'
import type { MaterialPlacement } from '../../src/material/types'

function createPlacement(
  scaleU: number,
  scaleV: number,
  translateU: number,
  translateV: number,
): MaterialPlacement
{
  const matrix = new Matrix3()
  const elements = matrix.elements
  elements[0] = scaleU
  elements[4] = scaleV
  elements[6] = translateU
  elements[7] = translateV
  return { uvTransform: matrix }
}

function rounded(array: Float32Array): number[]
{
  return Array.from(array).map((value) => Number(value.toFixed(4)))
}

describe('applyPlacementsToGeometries', () =>
{
  it('applies placement only once per geometry even if shared across meshes', () =>
  {
    const geometry = new BufferGeometry()
    const positions = new Float32Array(9)
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array([
      0, 0,
      1, 0,
      0, 1,
    ]), 2))

    const material = new MToonMaterial()
    const placement = createPlacement(0.5, 0.5, 0.25, 0.25)

    const root = new Object3D()
    root.add(new Mesh(geometry, material))
    root.add(new Mesh(geometry, material))

    const placementMap = new Map<MToonMaterial, MaterialPlacement>([
      [material, placement],
    ])

    const result = __applyPlacementsToGeometries(root, placementMap)
    expect(result.isOk()).toBe(true)

    const transformed = geometry.getAttribute('uv')!.array as Float32Array
    expect(rounded(transformed)).toEqual([0.25, 0.25, 0.75, 0.25, 0.25, 0.75])
  })

  it('fails when mesh has multiple materials', () =>
  {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(36), 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1,
      0, 1,
      1, 0,
    ]), 2))

    geometry.clearGroups()
    geometry.addGroup(0, 3, 0)
    geometry.addGroup(3, 3, 1)

    const matA = new MToonMaterial()
    const matB = new MToonMaterial()
    const placementA = createPlacement(0.5, 0.5, 0.2, 0.1)
    const placementB = createPlacement(0.25, 0.25, 0.6, 0.4)

    const mesh = new Mesh(geometry, [matA, matB])
    const root = new Object3D()
    root.add(mesh)

    const placementMap = new Map<MToonMaterial, MaterialPlacement>([
      [matA, placementA],
      [matB, placementB],
    ])

    const result = __applyPlacementsToGeometries(root, placementMap)
    expect(result.isErr()).toBe(true)
  })
})
