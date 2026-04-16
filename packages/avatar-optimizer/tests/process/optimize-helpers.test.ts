import { MToonMaterial } from '@pixiv/three-vrm'
import {
  BoxGeometry,
  Mesh,
  Skeleton,
  SkinnedMesh,
  Bone,
} from 'three'
import { describe, expect, it } from 'vitest'
import {
  collectExpressionMeshes,
  collectNonSkinnedMeshes,
  createEmptyCombinedMeshResult,
} from '../../src/util/optimize-helpers'

describe('optimize-helpers', () => {
  describe('collectNonSkinnedMeshes', () => {
    it('SkinnedMeshと通常Meshが混在する場合、通常Meshのみ返す', () => {
      const mat = new MToonMaterial()
      const geometry = new BoxGeometry()

      const normalMesh = new Mesh(geometry, mat)
      const bone = new Bone()
      const skinnedMesh = new SkinnedMesh(geometry, mat)
      skinnedMesh.bind(new Skeleton([bone]))

      const materialMeshMap = new Map<MToonMaterial, Mesh[]>()
      materialMeshMap.set(mat, [normalMesh, skinnedMesh])

      const result = collectNonSkinnedMeshes(materialMeshMap)

      expect(result.size).toBe(1)
      expect(result.has(normalMesh)).toBe(true)
      expect(result.has(skinnedMesh)).toBe(false)
    })

    it('全てSkinnedMeshの場合、空Setを返す', () => {
      const mat = new MToonMaterial()
      const geometry = new BoxGeometry()
      const bone = new Bone()

      const skinnedMesh1 = new SkinnedMesh(geometry, mat)
      skinnedMesh1.bind(new Skeleton([bone]))
      const skinnedMesh2 = new SkinnedMesh(geometry, mat)
      skinnedMesh2.bind(new Skeleton([bone]))

      const materialMeshMap = new Map<MToonMaterial, Mesh[]>()
      materialMeshMap.set(mat, [skinnedMesh1, skinnedMesh2])

      const result = collectNonSkinnedMeshes(materialMeshMap)

      expect(result.size).toBe(0)
    })

    it('空Mapの場合、空Setを返す', () => {
      const materialMeshMap = new Map<MToonMaterial, Mesh[]>()

      const result = collectNonSkinnedMeshes(materialMeshMap)

      expect(result.size).toBe(0)
    })
  })

  describe('collectExpressionMeshes', () => {
    it('expressionManagerがnullの場合、空Setを返す', () => {
      const result = collectExpressionMeshes(null)

      expect(result.size).toBe(0)
    })

    it('primitivesからメッシュを収集する', () => {
      const mesh1 = new Mesh(new BoxGeometry())
      const mesh2 = new Mesh(new BoxGeometry())

      const mockExpressionManager = {
        expressions: [
          {
            binds: [
              { primitives: [mesh1, mesh2] },
            ],
          },
        ],
      }

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const result = collectExpressionMeshes(mockExpressionManager as any)

      expect(result.size).toBe(2)
      expect(result.has(mesh1)).toBe(true)
      expect(result.has(mesh2)).toBe(true)
    })

    it('materialMeshMapありでMaterialColorBindのメッシュも収集する', () => {
      const mat = new MToonMaterial()
      const morphMesh = new Mesh(new BoxGeometry())
      const materialMesh = new Mesh(new BoxGeometry())

      const materialMeshMap = new Map<MToonMaterial, Mesh[]>()
      materialMeshMap.set(mat, [materialMesh])

      const mockExpressionManager = {
        expressions: [
          {
            binds: [
              { primitives: [morphMesh] },
              { material: mat },
            ],
          },
        ],
      }

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const result = collectExpressionMeshes(
        mockExpressionManager as any,
        materialMeshMap,
      )

      expect(result.size).toBe(2)
      expect(result.has(morphMesh)).toBe(true)
      expect(result.has(materialMesh)).toBe(true)
    })

    it('materialMeshMap未指定時はMaterialColorBindを無視する', () => {
      const mat = new MToonMaterial()
      const morphMesh = new Mesh(new BoxGeometry())

      const mockExpressionManager = {
        expressions: [
          {
            binds: [
              { primitives: [morphMesh] },
              { material: mat },
            ],
          },
        ],
      }

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const result = collectExpressionMeshes(mockExpressionManager as any)

      expect(result.size).toBe(1)
      expect(result.has(morphMesh)).toBe(true)
    })
  })

  describe('createEmptyCombinedMeshResult', () => {
    it('simplifyStatsなしの場合、全フィールドが初期値', () => {
      const result = createEmptyCombinedMeshResult()

      expect(result.groups.size).toBe(0)
      expect(result.materialSlotIndex.size).toBe(0)
      expect(result.statistics.originalMeshCount).toBe(0)
      expect(result.statistics.originalMaterialCount).toBe(0)
      expect(result.statistics.reducedDrawCalls).toBe(0)
      expect(result.statistics.simplify).toBeUndefined()
    })

    it('simplifyStatsありの場合、statisticsに反映される', () => {
      const simplifyStats = {
        processedMeshCount: 5,
        skippedMeshCount: 2,
        originalVertexCount: 10000,
        simplifiedVertexCount: 5000,
        originalIndexCount: 30000,
        simplifiedIndexCount: 15000,
      }

      const result = createEmptyCombinedMeshResult(simplifyStats)

      expect(result.statistics.simplify).toBe(simplifyStats)
      expect(result.statistics.simplify?.processedMeshCount).toBe(5)
      expect(result.statistics.simplify?.simplifiedVertexCount).toBe(5000)
    })
  })
})
