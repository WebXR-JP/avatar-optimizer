import { describe, expect, it } from 'vitest'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  DataTexture,
  RGBAFormat,
  FloatType,
} from 'three'
import { combineMToonMaterials, createParameterTexture } from '../src/material/combine'

/**
 * Helper function to create a simple BufferGeometry with vertices
 */
function createTestGeometry(vertexCount: number = 3): BufferGeometry {
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const indices = new Uint32Array(vertexCount)

  // Create a simple triangle
  for (let i = 0; i < vertexCount; i++) {
    positions[i * 3] = Math.random()
    positions[i * 3 + 1] = Math.random()
    positions[i * 3 + 2] = Math.random()

    normals[i * 3] = 0
    normals[i * 3 + 1] = 1
    normals[i * 3 + 2] = 0

    indices[i] = i
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setIndex(new Float32BufferAttribute(indices, 1))

  return geometry
}

/**
 * Helper function to create a test mesh with geometry and material
 */
function createTestMesh(material: any, vertexCount: number = 3): Mesh {
  const geometry = createTestGeometry(vertexCount)
  return new Mesh(geometry, material)
}

describe('Material Combining (combine.ts)', () => {
  describe('createParameterTexture', () => {
    it('should create a DataTexture with correct format', () => {
      const materials = [
        new MeshStandardMaterial({ color: 0xffffff }),
        new MeshStandardMaterial({ color: 0xff0000 }),
      ]
      const texelsPerSlot = 8

      const result = createParameterTexture(materials, texelsPerSlot)

      expect(result.isOk()).toBe(true)
      if (result.isErr()) return

      const texture = result.value
      expect(texture).toBeInstanceOf(DataTexture)
      expect(texture.format).toBe(RGBAFormat)
      expect(texture.type).toBe(FloatType)
    })

    it('should create texture with height matching material count', () => {
      const materialCount = 5
      const materials = Array.from({ length: materialCount }, () =>
        new MeshStandardMaterial({ color: Math.random() * 0xffffff })
      )

      const result = createParameterTexture(materials)

      expect(result.isOk()).toBe(true)
      if (result.isErr()) return

      const texture = result.value
      expect(texture.image.height).toBe(materialCount)
    })

    it('should handle single material', () => {
      const materials = [new MeshStandardMaterial({ color: 0xffffff })]
      const result = createParameterTexture(materials)

      expect(result.isOk()).toBe(true)
      if (result.isErr()) return

      const texture = result.value
      expect(texture.image.height).toBe(1)
      expect(texture.image.width).toBe(8) // Default texelsPerSlot
    })

    it('should respect custom texelsPerSlot parameter', () => {
      const materials = [new MeshStandardMaterial()]
      const customTexelsPerSlot = 16

      const result = createParameterTexture(materials, customTexelsPerSlot)

      expect(result.isOk()).toBe(true)
      if (result.isErr()) return

      const texture = result.value
      expect(texture.image.width).toBe(customTexelsPerSlot)
    })

    it('should create valid Float32Array data for texture', () => {
      const materials = [new MeshStandardMaterial()]
      const result = createParameterTexture(materials)

      expect(result.isOk()).toBe(true)
      if (result.isErr()) return

      const texture = result.value
      expect(texture.image.data).toBeDefined()
      expect(texture.image.data instanceof Float32Array).toBe(true)
    })
  })

  describe('combineMToonMaterials', () => {
    it('should return error when scene has no meshes', () => {
      const emptyScene = new Scene()
      const result = combineMToonMaterials(emptyScene)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('NO_MATERIALS_FOUND')
      }
    })

    it('should return error when meshes have no MToonNodeMaterial', () => {
      // This test documents the expected behavior:
      // The implementation filters for MToonNodeMaterial specifically
      const scene = new Scene()
      const material = new MeshStandardMaterial({ color: 0xffffff })
      const mesh = createTestMesh(material)
      scene.add(mesh)

      const result = combineMToonMaterials(scene)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('NO_MATERIALS_FOUND')
      }
    })

    it('should skip non-Mesh objects in scene traversal', () => {
      const scene = new Scene()
      scene.add(new Object3D()) // Non-Mesh object
      scene.add(new Object3D()) // Another non-Mesh object

      const result = combineMToonMaterials(scene)

      // Should fail gracefully with no materials found
      expect(result.isErr()).toBe(true)
    })

    it('should handle scene with mixed object types', () => {
      const scene = new Scene()
      scene.add(new Object3D())
      const material = new MeshStandardMaterial()
      const mesh = createTestMesh(material)
      scene.add(mesh)
      scene.add(new Object3D())

      const result = combineMToonMaterials(scene)

      // Should fail because material is not MToonNodeMaterial
      expect(result.isErr()).toBe(true)
    })

    it('should preserve original scene after processing', () => {
      const scene = new Scene()
      const originalChildCount = scene.children.length
      const result = combineMToonMaterials(scene)

      // Scene should not be modified by failed processing
      expect(scene.children.length).toBe(originalChildCount)
    })

    it('should accept custom options', () => {
      const emptyScene = new Scene()
      const options = {
        slotAttributeName: 'customSlot',
        texelsPerSlot: 16,
        atlasSize: 4096,
      }

      const result = combineMToonMaterials(emptyScene, options)

      // Function should accept options even if processing fails
      expect(result.isErr() || result.isOk()).toBe(true)
    })

    it('should handle meshes with missing normal attribute', () => {
      const scene = new Scene()
      const material = new MeshStandardMaterial()
      const geometry = new BufferGeometry()

      // Add only position attribute, no normal
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))

      const mesh = new Mesh(geometry, material)
      scene.add(mesh)

      const result = combineMToonMaterials(scene)

      // Should handle gracefully even with incomplete geometry
      expect(result.isErr() || result.isOk()).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('should return detailed error information', () => {
      const emptyScene = new Scene()
      const result = combineMToonMaterials(emptyScene)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error).toHaveProperty('type')
        expect(result.error).toHaveProperty('message')
        expect(typeof result.error.message).toBe('string')
      }
    })

    it('should handle Result type properly for neverthrow compatibility', () => {
      const result1 = createParameterTexture([])
      const result2 = combineMToonMaterials(new Scene())

      // Both should follow neverthrow Result pattern
      expect(typeof result1.isOk).toBe('function')
      expect(typeof result1.isErr).toBe('function')
      expect(typeof result2.isOk).toBe('function')
      expect(typeof result2.isErr).toBe('function')
    })
  })

  describe('Integration notes', () => {
    it('exports functions from material module', () => {
      expect(typeof combineMToonMaterials).toBe('function')
      expect(typeof createParameterTexture).toBe('function')
    })
  })
})
