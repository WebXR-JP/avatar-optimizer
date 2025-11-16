import { describe, expect, it } from 'vitest'
import { BufferGeometry, Float32BufferAttribute, Matrix3 } from 'three'
import { remapGeometryUVs } from '../../src/material/uv'
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

function rounded(values: Float32Array): number[]
{
  return Array.from(values).map((v) => Number(v.toFixed(4)))
}

describe('remapGeometryUVs', () =>
{
  it('remaps the entire UV attribute', () =>
  {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(18), 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array([
      0, 0,
      1, 0,
      0, 1,
    ]), 2))

    const placement = createPlacement(0.5, 0.5, 0.25, 0.25)
    const result = remapGeometryUVs(geometry, placement)
    expect(result.isOk()).toBe(true)

    const transformed = geometry.getAttribute('uv')!.array as Float32Array
    expect(rounded(transformed)).toEqual([0.25, 0.25, 0.75, 0.25, 0.25, 0.75])
  })

  it('returns an error when uv attribute is missing', () =>
  {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(18), 3))

    const placement = createPlacement(1, 1, 0, 0)
    const result = remapGeometryUVs(geometry, placement)
    expect(result.isErr()).toBe(true)
  })
})
