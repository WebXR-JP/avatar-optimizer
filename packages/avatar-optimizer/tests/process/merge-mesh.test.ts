import { MToonMaterial } from '@pixiv/three-vrm'
import
  {
    BufferAttribute,
    BufferGeometry,
    Mesh,
    SkinnedMesh,
    Skeleton,
    Bone,
  } from 'three'
import { describe, expect, it } from 'vitest'
import { mergeGeometriesWithSlotAttribute } from '../../src/util/mesh/merge-mesh'

describe('merge-mesh', () =>
{
  describe('mergeGeometriesWithSlotAttribute', () =>
  {
    it('should merge geometries and add slot attribute', () =>
    {
      // Create two simple meshes
      const geometry1 = new BufferGeometry()
      const positions1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      geometry1.setAttribute('position', new BufferAttribute(positions1, 3))

      const geometry2 = new BufferGeometry()
      const positions2 = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1])
      geometry2.setAttribute('position', new BufferAttribute(positions2, 3))

      const material1 = new MToonMaterial()
      const material2 = new MToonMaterial()

      const mesh1 = new Mesh(geometry1, material1)
      const mesh2 = new Mesh(geometry2, material2)

      const meshes = [mesh1, mesh2]
      const slotMap = new Map<Mesh, number>()
      slotMap.set(mesh1, 0)
      slotMap.set(mesh2, 1)

      const result = mergeGeometriesWithSlotAttribute(
        meshes,
        slotMap,
        'mtoonMaterialSlot',
      )

      expect(result.isOk()).toBe(true)

      if (result.isOk())
      {
        const [mergedGeometry] = result.value
        expect(mergedGeometry).toBeDefined()

        // Check that positions are merged
        const positions = mergedGeometry.getAttribute('position')
        expect(positions.count).toBe(6) // 3 vertices from each mesh

        // Check that slot attribute is added
        const slotAttr = mergedGeometry.getAttribute('mtoonMaterialSlot')
        expect(slotAttr).toBeDefined()
        expect(slotAttr.count).toBe(6)

        // First 3 vertices should have slot 0
        expect(slotAttr.getX(0)).toBe(0)
        expect(slotAttr.getX(1)).toBe(0)
        expect(slotAttr.getX(2)).toBe(0)

        // Next 3 vertices should have slot 1
        expect(slotAttr.getX(3)).toBe(1)
        expect(slotAttr.getX(4)).toBe(1)
        expect(slotAttr.getX(5)).toBe(1)
      }
    })

    it('should preserve skinning weights when merging skinned meshes', () =>
    {
      // Create a simple skinned mesh with bone weights
      const geometry1 = new BufferGeometry()
      const positions1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      geometry1.setAttribute('position', new BufferAttribute(positions1, 3))

      // Add skin weights and indices
      const skinWeights1 = new Float32Array([
        1.0, 0.0, 0.0, 0.0, // vertex 0: fully weighted to bone 0
        0.5, 0.5, 0.0, 0.0, // vertex 1: split between bone 0 and 1
        0.0, 1.0, 0.0, 0.0, // vertex 2: fully weighted to bone 1
      ])
      const skinIndices1 = new Float32Array([
        0, 1, 2, 3, // vertex 0
        0, 1, 2, 3, // vertex 1
        0, 1, 2, 3, // vertex 2
      ])
      geometry1.setAttribute(
        'skinWeight',
        new BufferAttribute(skinWeights1, 4),
      )
      geometry1.setAttribute(
        'skinIndex',
        new BufferAttribute(skinIndices1, 4),
      )

      // Create a second skinned mesh
      const geometry2 = new BufferGeometry()
      const positions2 = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1])
      geometry2.setAttribute('position', new BufferAttribute(positions2, 3))

      const skinWeights2 = new Float32Array([
        0.0, 0.0, 1.0, 0.0, // vertex 0: fully weighted to bone 2
        0.0, 0.0, 0.5, 0.5, // vertex 1: split between bone 2 and 3
        0.0, 0.0, 0.0, 1.0, // vertex 2: fully weighted to bone 3
      ])
      const skinIndices2 = new Float32Array([
        0, 1, 2, 3, // vertex 0
        0, 1, 2, 3, // vertex 1
        0, 1, 2, 3, // vertex 2
      ])
      geometry2.setAttribute(
        'skinWeight',
        new BufferAttribute(skinWeights2, 4),
      )
      geometry2.setAttribute(
        'skinIndex',
        new BufferAttribute(skinIndices2, 4),
      )

      // Create bones and skeleton
      const bone0 = new Bone()
      const bone1 = new Bone()
      const bone2 = new Bone()
      const bone3 = new Bone()
      const bones = [bone0, bone1, bone2, bone3]
      const skeleton = new Skeleton(bones)

      const material1 = new MToonMaterial()
      const material2 = new MToonMaterial()

      const skinnedMesh1 = new SkinnedMesh(geometry1, material1)
      skinnedMesh1.bind(skeleton)

      const skinnedMesh2 = new SkinnedMesh(geometry2, material2)
      skinnedMesh2.bind(skeleton)

      const meshes = [skinnedMesh1, skinnedMesh2]
      const slotMap = new Map<Mesh, number>()
      slotMap.set(skinnedMesh1, 0)
      slotMap.set(skinnedMesh2, 1)

      const result = mergeGeometriesWithSlotAttribute(
        meshes,
        slotMap,
        'mtoonMaterialSlot',
      )

      expect(result.isOk()).toBe(true)

      if (result.isOk())
      {
        const [mergedGeometry] = result.value

        // Check that skinWeight attribute is preserved
        const skinWeight = mergedGeometry.getAttribute('skinWeight')
        expect(skinWeight).toBeDefined()
        expect(skinWeight.count).toBe(6) // 3 vertices from each mesh

        // Check that skinIndex attribute is preserved
        const skinIndex = mergedGeometry.getAttribute('skinIndex')
        expect(skinIndex).toBeDefined()
        expect(skinIndex.count).toBe(6)

        // Verify first mesh's skin weights are preserved
        // Vertex 0 from mesh1
        expect(skinWeight.getX(0)).toBeCloseTo(1.0)
        expect(skinWeight.getY(0)).toBeCloseTo(0.0)
        expect(skinWeight.getZ(0)).toBeCloseTo(0.0)
        expect(skinWeight.getW(0)).toBeCloseTo(0.0)

        // Vertex 1 from mesh1
        expect(skinWeight.getX(1)).toBeCloseTo(0.5)
        expect(skinWeight.getY(1)).toBeCloseTo(0.5)
        expect(skinWeight.getZ(1)).toBeCloseTo(0.0)
        expect(skinWeight.getW(1)).toBeCloseTo(0.0)

        // Vertex 2 from mesh1
        expect(skinWeight.getX(2)).toBeCloseTo(0.0)
        expect(skinWeight.getY(2)).toBeCloseTo(1.0)
        expect(skinWeight.getZ(2)).toBeCloseTo(0.0)
        expect(skinWeight.getW(2)).toBeCloseTo(0.0)

        // Verify second mesh's skin weights are preserved
        // Vertex 0 from mesh2
        expect(skinWeight.getX(3)).toBeCloseTo(0.0)
        expect(skinWeight.getY(3)).toBeCloseTo(0.0)
        expect(skinWeight.getZ(3)).toBeCloseTo(1.0)
        expect(skinWeight.getW(3)).toBeCloseTo(0.0)

        // Vertex 1 from mesh2
        expect(skinWeight.getX(4)).toBeCloseTo(0.0)
        expect(skinWeight.getY(4)).toBeCloseTo(0.0)
        expect(skinWeight.getZ(4)).toBeCloseTo(0.5)
        expect(skinWeight.getW(4)).toBeCloseTo(0.5)

        // Vertex 2 from mesh2
        expect(skinWeight.getX(5)).toBeCloseTo(0.0)
        expect(skinWeight.getY(5)).toBeCloseTo(0.0)
        expect(skinWeight.getZ(5)).toBeCloseTo(0.0)
        expect(skinWeight.getW(5)).toBeCloseTo(1.0)

        // Verify skin indices are preserved
        expect(skinIndex.getX(0)).toBe(0)
        expect(skinIndex.getY(0)).toBe(1)
        expect(skinIndex.getZ(0)).toBe(2)
        expect(skinIndex.getW(0)).toBe(3)
      }
    })

    it('should handle empty mesh array', () =>
    {
      const result = mergeGeometriesWithSlotAttribute(
        [],
        new Map(),
        'mtoonMaterialSlot',
      )

      expect(result.isErr()).toBe(true)
      if (result.isErr())
      {
        expect(result.error.type).toBe('ASSET_ERROR')
        expect(result.error.message).toContain('マージ対象のメッシュがありません')
      }
    })

    it('should handle meshes with no valid geometry', () =>
    {
      const emptyGeometry = new BufferGeometry()
      const mesh = new Mesh(emptyGeometry, new MToonMaterial())

      const result = mergeGeometriesWithSlotAttribute(
        [mesh],
        new Map([[mesh, 0]]),
        'mtoonMaterialSlot',
      )

      expect(result.isErr()).toBe(true)
      if (result.isErr())
      {
        expect(result.error.type).toBe('ASSET_ERROR')
        expect(result.error.message).toContain(
          '有効なジオメトリを持つメッシュがありません',
        )
      }
    })
  })
})
