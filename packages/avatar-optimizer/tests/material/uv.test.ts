import { describe, expect, it } from 'vitest'
import { BufferGeometry, Float32BufferAttribute, Matrix3 } from 'three'
import { remapGeometryUVsByGroup } from '../../src/material/uv'
import type { MaterialPlacement } from '../../src/material/types'

function roundedSlice(array: Float32Array, start: number, end?: number): number[]
{
  return Array.from(array.slice(start, end)).map((value) => Number(value.toFixed(4)))
}

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

describe('remapGeometryUVsByGroup', () =>
{
  it('remaps only the specified non-indexed group', () =>
  {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(18), 3))

    const uvValues = new Float32Array([
      0, 0,
      1, 0,
      0, 1, // group 0
      1, 1,
      0, 1,
      1, 0, // group 1
    ])
    geometry.setAttribute('uv', new Float32BufferAttribute(uvValues, 2))

    geometry.clearGroups()
    geometry.addGroup(0, 3, 0)
    geometry.addGroup(3, 3, 1)

    const placement = createPlacement(0.5, 0.5, 0.25, 0.25)
    const result = remapGeometryUVsByGroup(geometry, placement, 1)
    expect(result.isOk()).toBe(true)

    const transformed = geometry.getAttribute('uv')!.array as Float32Array
    expect(roundedSlice(transformed, 0, 6)).toEqual([0, 0, 1, 0, 0, 1])
    expect(roundedSlice(transformed, 6)).toEqual([
      0.75, 0.75,
      0.25, 0.75,
      0.75, 0.25,
    ])
  })

  it('remaps indices that belong to the group when geometry is indexed', () =>
  {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(18), 3))

    const uvValues = new Float32Array([
      0, 0,
      1, 0,
      0, 1, // group 0 (indices 0-2)
      1, 1,
      0, 1,
      1, 0, // group 1 (indices 3-5)
    ])
    geometry.setAttribute('uv', new Float32BufferAttribute(uvValues, 2))
    geometry.setIndex([0, 1, 2, 3, 4, 5])

    geometry.clearGroups()
    geometry.addGroup(0, 3, 0)
    geometry.addGroup(3, 3, 1)

    const placement = createPlacement(0.25, 0.25, 0.1, 0.2)
    const result = remapGeometryUVsByGroup(geometry, placement, 1)
    expect(result.isOk()).toBe(true)

    const transformed = geometry.getAttribute('uv')!.array as Float32Array
    expect(roundedSlice(transformed, 0, 6)).toEqual([0, 0, 1, 0, 0, 1])
    expect(roundedSlice(transformed, 6)).toEqual([
      0.35, 0.45,
      0.1, 0.45,
      0.35, 0.2,
    ])
  })
})
