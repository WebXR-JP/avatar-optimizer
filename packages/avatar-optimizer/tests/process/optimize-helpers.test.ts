import { MToonMaterial } from '@pixiv/three-vrm'
import { Bone, BoxGeometry, Mesh, Object3D, Skeleton, SkinnedMesh } from 'three'
import { describe, expect, it } from 'vitest'
import {
  collectExpressionMeshes,
  collectNonSkinnedMeshes,
  createEmptyCombinedMeshResult,
  hasAtlasedMaterial,
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
            binds: [{ primitives: [mesh1, mesh2] }],
          },
        ],
      }

      const result = collectExpressionMeshes(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
        mockExpressionManager as any,
      )

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
            binds: [{ primitives: [morphMesh] }, { material: mat }],
          },
        ],
      }

      const result = collectExpressionMeshes(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
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
            binds: [{ primitives: [morphMesh] }, { material: mat }],
          },
        ],
      }

      const result = collectExpressionMeshes(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
        mockExpressionManager as any,
      )

      expect(result.size).toBe(1)
      expect(result.has(morphMesh)).toBe(true)
    })
  })

  describe('hasAtlasedMaterial', () => {
    it('MToonAtlasMaterial があれば true', () => {
      // instanceof ではなくプロパティで判定するため、
      // フラグを持つだけのオブジェクトでも検出される
      const mat = new MToonMaterial()
      ;(
        mat as unknown as { isMToonAtlasMaterial: boolean }
      ).isMToonAtlasMaterial = true
      const root = new Object3D()
      root.add(new Mesh(new BoxGeometry(), mat))

      expect(hasAtlasedMaterial(root)).toBe(true)
    })

    it('通常の MToonMaterial だけなら false', () => {
      const root = new Object3D()
      root.add(new Mesh(new BoxGeometry(), new MToonMaterial()))

      expect(hasAtlasedMaterial(root)).toBe(false)
    })

    it('マテリアル配列の中にあっても検出する', () => {
      const atlas = new MToonMaterial()
      ;(
        atlas as unknown as { isMToonAtlasMaterial: boolean }
      ).isMToonAtlasMaterial = true
      const root = new Object3D()
      root.add(new Mesh(new BoxGeometry(), [new MToonMaterial(), atlas]))

      expect(hasAtlasedMaterial(root)).toBe(true)
    })

    it('メッシュが無ければ false', () => {
      expect(hasAtlasedMaterial(new Object3D())).toBe(false)
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

    it('atlasSkippedを渡さない場合はundefined', () => {
      const result = createEmptyCombinedMeshResult()

      expect(result.atlasSkipped).toBeUndefined()
    })

    it('ALREADY_OPTIMIZED も保持できる', () => {
      const result = createEmptyCombinedMeshResult(undefined, {
        reason: 'ALREADY_OPTIMIZED',
        message: '既にアトラス化済み',
      })

      expect(result.atlasSkipped?.reason).toBe('ALREADY_OPTIMIZED')
    })

    it('atlasSkippedを渡すとそのまま保持される', () => {
      // 呼び出し側が「アトラス化がスキップされた」ことを検知できるようにする。
      // これが無いと最適化が no-op でも正常終了に見えてしまう
      const result = createEmptyCombinedMeshResult(undefined, {
        reason: 'NO_MTOON_MATERIAL',
        message: 'テスト用メッセージ',
      })

      expect(result.atlasSkipped?.reason).toBe('NO_MTOON_MATERIAL')
      expect(result.atlasSkipped?.message).toBe('テスト用メッセージ')
    })
  })
})
