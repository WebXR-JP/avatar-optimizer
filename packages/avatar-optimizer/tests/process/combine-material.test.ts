import { MToonMaterial } from '@pixiv/three-vrm'
import { BufferAttribute, BufferGeometry, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { combineMToonMaterials } from '../../src/util/material/combine'

describe('combineMToonMaterials', () => {
  it('should exclude meshes specified in excludedMeshes', () => {
    // Create two simple meshes with the same material
    const geometry1 = new BufferGeometry()
    const positions1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    geometry1.setAttribute('position', new BufferAttribute(positions1, 3))

    const geometry2 = new BufferGeometry()
    const positions2 = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1])
    geometry2.setAttribute('position', new BufferAttribute(positions2, 3))

    const material = new MToonMaterial()

    const mesh1 = new Mesh(geometry1, material)
    const mesh2 = new Mesh(geometry2, material)

    const materialMeshMap = new Map<MToonMaterial, Mesh[]>()
    materialMeshMap.set(material, [mesh1, mesh2])

    const excludedMeshes = new Set<Mesh>([mesh2])

    const result = combineMToonMaterials(materialMeshMap, {}, excludedMeshes)

    expect(result.isOk()).toBe(true)

    if (result.isOk()) {
      const { statistics } = result.value
      // Should only contain mesh1
      expect(statistics.originalMeshCount).toBe(1)
    }
  })

  it('should include all meshes if excludedMeshes is empty', () => {
    // Create two simple meshes with the same material
    const geometry1 = new BufferGeometry()
    const positions1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    geometry1.setAttribute('position', new BufferAttribute(positions1, 3))

    const geometry2 = new BufferGeometry()
    const positions2 = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1])
    geometry2.setAttribute('position', new BufferAttribute(positions2, 3))

    const material = new MToonMaterial()

    const mesh1 = new Mesh(geometry1, material)
    const mesh2 = new Mesh(geometry2, material)

    const materialMeshMap = new Map<MToonMaterial, Mesh[]>()
    materialMeshMap.set(material, [mesh1, mesh2])

    const result = combineMToonMaterials(materialMeshMap, {})

    expect(result.isOk()).toBe(true)

    if (result.isOk()) {
      const { statistics } = result.value
      // Should contain both meshes
      expect(statistics.originalMeshCount).toBe(2)
    }
  })
})
