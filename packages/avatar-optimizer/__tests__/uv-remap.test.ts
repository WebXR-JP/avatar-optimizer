import { describe, expect, it } from 'vitest'
import { GLTFScenegraph } from '@loaders.gl/gltf'

import { remapPrimitiveUVs } from '../src/core/uv-remap'
import type { PendingMaterialPlacement } from '../src/vrm/scenegraph-adapter'

describe('remapPrimitiveUVs', () => {
  it('applies atlas transform to TEXCOORD_0', () => {
    const initialUVs = [0, 0, 1, 0, 1, 1, 0, 1]
    const scenegraph = createScenegraph(initialUVs)

    const placement: PendingMaterialPlacement = {
      materialIndex: 0,
      texCoord: 0,
      uvTransform: [0.5, 0, 0.25, 0, 0.5, 0.25, 0, 0, 1],
    }

    remapPrimitiveUVs(scenegraph, [placement])

    const updated = Array.from(scenegraph.getTypedArrayForAccessor(0) as Float32Array)
    expect(updated).toEqual([0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75])
  })

  it('ignores primitives without matching attributes', () => {
    const initialUVs = [0, 0, 1, 0]
    const scenegraph = createScenegraph(initialUVs, { omitTexCoord0: true })

    const placement: PendingMaterialPlacement = {
      materialIndex: 0,
      texCoord: 0,
      uvTransform: [1, 0, 0.5, 0, 1, 0.5, 0, 0, 1],
    }

    remapPrimitiveUVs(scenegraph, [placement])

    const updated = Array.from(scenegraph.getTypedArrayForAccessor(0) as Float32Array)
    expect(updated).toEqual(initialUVs)
  })

  it('applies transform only once per accessor even if shared by multiple primitives', () => {
    const initialUVs = [0, 0, 1, 0]
    const scenegraph = createScenegraph(initialUVs, { duplicatePrimitive: true })

    const placement: PendingMaterialPlacement = {
      materialIndex: 0,
      texCoord: 0,
      uvTransform: [0.5, 0, 0.25, 0, 0.5, 0.25, 0, 0, 1],
    }

    remapPrimitiveUVs(scenegraph, [placement])

    const updated = Array.from(scenegraph.getTypedArrayForAccessor(0) as Float32Array)
    expect(updated).toEqual([0.25, 0.25, 0.75, 0.25])
  })
})

function createScenegraph(
  uvs: number[],
  options: { omitTexCoord0?: boolean; duplicatePrimitive?: boolean } = {},
): GLTFScenegraph {
  const floatData = new Float32Array(uvs)
  const buffer = new ArrayBuffer(floatData.byteLength)
  new Float32Array(buffer).set(floatData)

  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: buffer.byteLength }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: buffer.byteLength,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: uvs.length / 2,
        type: 'VEC2',
      },
    ],
    meshes: [
      {
        primitives: buildPrimitives(options),
      },
    ],
    materials: [{}],
  }

  return new GLTFScenegraph({
    json,
    buffers: [
      {
        arrayBuffer: buffer,
        byteOffset: 0,
        byteLength: buffer.byteLength,
      },
    ],
  })
}

function buildPrimitives(options: { omitTexCoord0?: boolean; duplicatePrimitive?: boolean }) {
  const base = {
    attributes: options.omitTexCoord0 ? {} : { TEXCOORD_0: 0 },
    material: 0,
  }

  if (!options.duplicatePrimitive) {
    return [base]
  }

  return [base, { ...base }]
}
