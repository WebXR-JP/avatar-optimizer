import { MToonMaterial } from '@pixiv/three-vrm'
import { BufferAttribute, BufferGeometry, Mesh, Object3D, Vector2 } from 'three'
import { describe, expect, it } from 'vitest'
import { applyPlacementsToGeometries } from '../../src/process/set-uv'
import { OffsetScale } from '../../src/types'

describe('set-uv', () => {
  describe('applyPlacementsToGeometries', () => {
    it('should remap UVs based on placement', () => {
      // Create a mesh with a geometry and material
      const geometry = new BufferGeometry()
      // Simple quad UVs: (0,0), (1,0), (0,1), (1,1)
      const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])
      geometry.setAttribute('uv', new BufferAttribute(uvs, 2))

      const material = new MToonMaterial()
      const mesh = new Mesh(geometry, material)
      const root = new Object3D()
      root.add(mesh)

      // Define placement: scale 0.5, offset 0.25 (center quadrant)
      const placement: OffsetScale = {
        offset: new Vector2(0.25, 0.25),
        scale: new Vector2(0.5, 0.5),
      }

      const placementMap = new Map<MToonMaterial, OffsetScale>()
      placementMap.set(material, placement)

      const result = applyPlacementsToGeometries(root, placementMap)

      expect(result.isOk()).toBe(true)

      // Check new UVs
      const newUvs = mesh.geometry.getAttribute('uv')
      expect(newUvs).toBeDefined()

      // Expected: original * scale + offset
      // (0,0) -> 0.25, 0.25
      expect(newUvs.getX(0)).toBeCloseTo(0.25)
      expect(newUvs.getY(0)).toBeCloseTo(0.25)

      // (1,0) -> 0.75, 0.25
      expect(newUvs.getX(1)).toBeCloseTo(0.75)
      expect(newUvs.getY(1)).toBeCloseTo(0.25)

      // (1,1) -> 0.75, 0.75
      expect(newUvs.getX(3)).toBeCloseTo(0.75)
      expect(newUvs.getY(3)).toBeCloseTo(0.75)
    })

    it('should ignore meshes with non-MToon materials', () => {
      const geometry = new BufferGeometry()
      const uvs = new Float32Array([0, 0])
      geometry.setAttribute('uv', new BufferAttribute(uvs, 2))

      // Standard Mesh (not MToon)
      const mesh = new Mesh(geometry)
      const root = new Object3D()
      root.add(mesh)

      const placementMap = new Map<MToonMaterial, OffsetScale>()

      const result = applyPlacementsToGeometries(root, placementMap)

      expect(result.isOk()).toBe(true)
      // Geometry should not be cloned/replaced
      expect(mesh.geometry).toBe(geometry)
    })
  })
})
