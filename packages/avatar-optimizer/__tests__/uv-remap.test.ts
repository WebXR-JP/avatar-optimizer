import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Scene } from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { describe, expect, it } from 'vitest'

import { remapPrimitiveUVs } from '../src/core/uv-remap'
import type { PendingMaterialPlacement } from '../src/vrm/scenegraph-adapter'
import type { ThreeVRMDocument } from '../src/types'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

describe('remapPrimitiveUVs (three.js)', () => {
  it('applies atlas transform to uv attribute', () => {
    const { document, material, attribute } = createDocumentWithUVs([0, 0, 1, 0, 1, 1, 0, 1])

    const placement: PendingMaterialPlacement = {
      materialUuid: material.uuid,
      uvTransform: [0.5, 0, 0.25, 0, 0.5, 0.25, 0, 0, 1],
    }

    remapPrimitiveUVs(document, [placement])

    expect(Array.from(attribute.array as Float32Array)).toEqual([
      0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75,
    ])
  })

  it('ignores materials without placements', () => {
    const { document, attribute } = createDocumentWithUVs([0, 0, 1, 0])

    remapPrimitiveUVs(document, [])

    expect(Array.from(attribute.array as Float32Array)).toEqual([0, 0, 1, 0])
  })

  it('applies transform only once per shared attribute', () => {
    const { document, material, attribute, mesh } = createDocumentWithUVs([0, 0, 1, 0])
    // Share geometry across another mesh/material reference
    const clone = new Mesh(mesh.geometry, material)
    document.gltf.scene?.add(clone)

    const placement: PendingMaterialPlacement = {
      materialUuid: material.uuid,
      uvTransform: [0.5, 0, 0.25, 0, 0.5, 0.25, 0, 0, 1],
    }

    remapPrimitiveUVs(document, [placement])

    expect(Array.from(attribute.array as Float32Array)).toEqual([0.25, 0.25, 0.75, 0.25])
  })
})

function createDocumentWithUVs(uvs: number[]) {
  const geometry = new BufferGeometry()
  const attribute = new Float32BufferAttribute(new Float32Array(uvs), 2)
  geometry.setAttribute('uv', attribute)

  const material = new MeshBasicMaterial()
  const mesh = new Mesh(geometry, material)

  const scene = new Scene()
  scene.add(mesh)

  const gltf = {
    scene,
    scenes: [scene],
    animations: [],
  } as unknown as GLTF

  const vrm = {
    materials: [material],
  } as unknown as VRM

  const document: ThreeVRMDocument = {
    gltf,
    vrm,
  }

  return { document, material, attribute, mesh }
}
