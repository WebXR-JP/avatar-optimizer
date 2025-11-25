import { MToonMaterial } from '@pixiv/three-vrm'
import { Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { buildPatternMaterialMappings, pack } from '../../src/process/packing'

describe('packing', () => {
  describe('buildPatternMaterialMappings', () => {
    it('should group materials with same texture pattern', () => {
      const tex1 = new Texture()
      tex1.image = { width: 100, height: 100 }
      const tex2 = new Texture()
      tex2.image = { width: 100, height: 100 }

      const mat1 = new MToonMaterial()
      mat1.map = tex1

      const mat2 = new MToonMaterial()
      mat2.map = tex1 // Same texture

      const mat3 = new MToonMaterial()
      mat3.map = tex2 // Different texture

      const materials = [mat1, mat2, mat3]
      const mappings = buildPatternMaterialMappings(materials)

      expect(mappings).toHaveLength(2)
      expect(mappings[0].materialIndices).toEqual([0, 1])
      expect(mappings[1].materialIndices).toEqual([2])
    })

    it('should handle materials with no textures', () => {
      const mat1 = new MToonMaterial()
      const mat2 = new MToonMaterial()

      const materials = [mat1, mat2]
      const mappings = buildPatternMaterialMappings(materials)

      expect(mappings).toHaveLength(1)
      expect(mappings[0].materialIndices).toEqual([0, 1])
      expect(mappings[0].textureDescriptor).toEqual({ width: 0, height: 0 })
    })
  })

  describe('pack', () => {
    it('should generate packing layouts for given mappings', async () => {
      const tex1 = new Texture()
      tex1.image = { width: 512, height: 512 }

      const mat1 = new MToonMaterial()
      mat1.map = tex1

      const mappings = buildPatternMaterialMappings([mat1])

      const result = await pack(mappings)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const layouts = result.value
        expect(layouts.packed).toHaveLength(1)
        expect(layouts.packed[0].scale.x).toBeGreaterThan(0)
        expect(layouts.packed[0].scale.y).toBeGreaterThan(0)
      }
    })
  })
})
