import { MeshoptSimplifier } from 'meshoptimizer'
import { BufferAttribute, BufferGeometry, Mesh, Object3D } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { simplifyMeshes } from '../../src/process/simplify'
import { simplifyGeometry } from '../../src/util/mesh/simplify-mesh'

describe('simplify', () => {
  // meshoptimizer WASM の初期化
  beforeAll(async () => {
    await MeshoptSimplifier.ready
  })

  describe('simplifyGeometry', () => {
    it('should simplify a simple indexed geometry', () => {
      // 6頂点、2三角形のシンプルなジオメトリを作成
      const geometry = new BufferGeometry()
      // 平面: 4頂点で2三角形
      const positions = new Float32Array([
        0,
        0,
        0, // 0
        1,
        0,
        0, // 1
        1,
        1,
        0, // 2
        0,
        1,
        0, // 3
      ])
      const normals = new Float32Array([
        0,
        0,
        1, // 0
        0,
        0,
        1, // 1
        0,
        0,
        1, // 2
        0,
        0,
        1, // 3
      ])
      const uvs = new Float32Array([
        0,
        0, // 0
        1,
        0, // 1
        1,
        1, // 2
        0,
        1, // 3
      ])
      const indices = new Uint32Array([0, 1, 2, 0, 2, 3])

      geometry.setAttribute('position', new BufferAttribute(positions, 3))
      geometry.setAttribute('normal', new BufferAttribute(normals, 3))
      geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
      geometry.setIndex(new BufferAttribute(indices, 1))

      const result = simplifyGeometry(geometry, {
        targetRatio: 1.0, // 削減なしでも動作確認
        targetError: 0.01,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const simplified = result.value
        // 最小限2三角形 (6インデックス) なので削減は限定的
        expect(simplified.getAttribute('position')).toBeDefined()
        expect(simplified.index).toBeDefined()
      }
    })

    it('should simplify a complex geometry with many triangles', () => {
      // 高密度なグリッドメッシュを生成
      const gridSize = 10
      const geometry = new BufferGeometry()
      const positions: number[] = []
      const normals: number[] = []
      const uvs: number[] = []
      const indices: number[] = []

      // グリッド頂点を生成
      for (let y = 0; y <= gridSize; y++) {
        for (let x = 0; x <= gridSize; x++) {
          positions.push(x, y, 0)
          normals.push(0, 0, 1)
          uvs.push(x / gridSize, y / gridSize)
        }
      }

      // グリッドインデックスを生成
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const i = y * (gridSize + 1) + x
          indices.push(i, i + 1, i + gridSize + 1)
          indices.push(i + 1, i + gridSize + 2, i + gridSize + 1)
        }
      }

      geometry.setAttribute(
        'position',
        new BufferAttribute(new Float32Array(positions), 3),
      )
      geometry.setAttribute(
        'normal',
        new BufferAttribute(new Float32Array(normals), 3),
      )
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
      geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1))

      const originalIndexCount = indices.length
      const originalVertexCount = (gridSize + 1) * (gridSize + 1)

      const result = simplifyGeometry(geometry, {
        targetRatio: 0.5,
        targetError: 0.1, // 許容誤差を大きくして削減を促進
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const simplified = result.value
        const newIndexCount = simplified.index?.count ?? 0
        const newVertexCount = simplified.getAttribute('position')?.count ?? 0

        // 削減されていることを確認
        expect(newIndexCount).toBeLessThanOrEqual(originalIndexCount)
        expect(newVertexCount).toBeLessThanOrEqual(originalVertexCount)

        // 属性が保持されていることを確認
        expect(simplified.getAttribute('normal')).toBeDefined()
        expect(simplified.getAttribute('uv')).toBeDefined()
      }
    })

    it('should handle non-indexed geometry', () => {
      const geometry = new BufferGeometry()
      // 非インデックスジオメトリ（3頂点 = 1三角形）
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      geometry.setAttribute('position', new BufferAttribute(positions, 3))

      const result = simplifyGeometry(geometry, {
        targetRatio: 1.0,
        targetError: 0.01,
      })

      expect(result.isOk()).toBe(true)
    })

    it('should return error for geometry without position attribute', () => {
      const geometry = new BufferGeometry()
      // position属性なし

      const result = simplifyGeometry(geometry, {
        targetRatio: 0.5,
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('ASSET_ERROR')
        expect(result.error.message).toContain('position属性が存在しません')
      }
    })

    it('should preserve skinning attributes after simplification', () => {
      // SkinnedMesh用のジオメトリを作成
      const geometry = new BufferGeometry()
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])
      const skinWeights = new Float32Array([
        1, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 1, 0, 0, 0.25, 0.25, 0.25, 0.25,
      ])
      const skinIndices = new Uint16Array([
        0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3,
      ])
      const indices = new Uint32Array([0, 1, 2, 1, 3, 2])

      geometry.setAttribute('position', new BufferAttribute(positions, 3))
      geometry.setAttribute('skinWeight', new BufferAttribute(skinWeights, 4))
      geometry.setAttribute('skinIndex', new BufferAttribute(skinIndices, 4))
      geometry.setIndex(new BufferAttribute(indices, 1))

      const result = simplifyGeometry(geometry, {
        targetRatio: 1.0, // 削減なし
        targetError: 0.01,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const simplified = result.value
        // skinWeight と skinIndex が保持されていることを確認
        expect(simplified.getAttribute('skinWeight')).toBeDefined()
        expect(simplified.getAttribute('skinIndex')).toBeDefined()
      }
    })
  })

  describe('simplifyMeshes', () => {
    it('should simplify meshes in an Object3D tree', async () => {
      const root = new Object3D()

      // 簡略化対象のメッシュを作成
      const geometry = createGridGeometry(5)
      const mesh = new Mesh(geometry)
      mesh.name = 'testMesh'
      root.add(mesh)

      const originalVertexCount = geometry.getAttribute('position').count

      const result = await simplifyMeshes(root, new Set(), {
        targetRatio: 0.5,
        targetError: 0.1,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const stats = result.value
        expect(stats.processedMeshCount).toBe(1)
        expect(stats.skippedMeshCount).toBe(0)
        expect(stats.originalVertexCount).toBe(originalVertexCount)
        // 頂点が削減されていることを確認
        expect(stats.simplifiedVertexCount).toBeLessThanOrEqual(
          stats.originalVertexCount,
        )
      }
    })

    it('should skip excluded meshes', async () => {
      const root = new Object3D()

      const geometry1 = createGridGeometry(5)
      const mesh1 = new Mesh(geometry1)
      mesh1.name = 'includedMesh'

      const geometry2 = createGridGeometry(5)
      const mesh2 = new Mesh(geometry2)
      mesh2.name = 'excludedMesh'

      root.add(mesh1)
      root.add(mesh2)

      const excludedMeshes = new Set([mesh2])

      const result = await simplifyMeshes(root, excludedMeshes, {
        targetRatio: 0.5,
        targetError: 0.1,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const stats = result.value
        expect(stats.processedMeshCount).toBe(1)
        expect(stats.skippedMeshCount).toBe(1)
      }
    })

    it('should skip meshes with MorphTargets when morphTargetHandling is skip', async () => {
      const root = new Object3D()

      const geometry = createGridGeometry(5)
      // MorphTargetを追加
      const morphPositions = new Float32Array(
        geometry.getAttribute('position').count * 3,
      )
      geometry.morphAttributes.position = [
        new BufferAttribute(morphPositions, 3),
      ]

      const mesh = new Mesh(geometry)
      mesh.name = 'morphMesh'
      root.add(mesh)

      const result = await simplifyMeshes(root, new Set(), {
        targetRatio: 0.5,
        morphTargetHandling: 'skip',
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const stats = result.value
        expect(stats.processedMeshCount).toBe(0)
        expect(stats.skippedMeshCount).toBe(1)
      }
    })

    it('should process meshes with MorphTargets when morphTargetHandling is discard', async () => {
      const root = new Object3D()

      const geometry = createGridGeometry(5)
      // MorphTargetを追加
      const morphPositions = new Float32Array(
        geometry.getAttribute('position').count * 3,
      )
      geometry.morphAttributes.position = [
        new BufferAttribute(morphPositions, 3),
      ]

      const mesh = new Mesh(geometry)
      mesh.name = 'morphMesh'
      root.add(mesh)

      const result = await simplifyMeshes(root, new Set(), {
        targetRatio: 0.5,
        targetError: 0.1,
        morphTargetHandling: 'discard',
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const stats = result.value
        expect(stats.processedMeshCount).toBe(1)
        expect(stats.skippedMeshCount).toBe(0)
      }
    })

    it('should calculate correct reduction ratios', async () => {
      const root = new Object3D()

      // 大きめのグリッドで削減を確認
      const geometry = createGridGeometry(20)
      const mesh = new Mesh(geometry)
      root.add(mesh)

      const result = await simplifyMeshes(root, new Set(), {
        targetRatio: 0.3, // 30%に削減
        targetError: 0.2,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const stats = result.value
        // 削減率が計算されていることを確認
        expect(stats.vertexReductionRatio).toBeGreaterThanOrEqual(0)
        expect(stats.vertexReductionRatio).toBeLessThanOrEqual(1)
        expect(stats.indexReductionRatio).toBeGreaterThanOrEqual(0)
        expect(stats.indexReductionRatio).toBeLessThanOrEqual(1)

        // 実際に削減されていることを確認
        expect(stats.simplifiedVertexCount).toBeLessThan(
          stats.originalVertexCount,
        )
        expect(stats.simplifiedIndexCount).toBeLessThan(
          stats.originalIndexCount,
        )
      }
    })
  })
})

/**
 * テスト用のグリッドジオメトリを生成
 */
function createGridGeometry(gridSize: number): BufferGeometry {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let y = 0; y <= gridSize; y++) {
    for (let x = 0; x <= gridSize; x++) {
      positions.push(x, y, 0)
      normals.push(0, 0, 1)
      uvs.push(x / gridSize, y / gridSize)
    }
  }

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const i = y * (gridSize + 1) + x
      indices.push(i, i + 1, i + gridSize + 1)
      indices.push(i + 1, i + gridSize + 2, i + gridSize + 1)
    }
  }

  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(positions), 3),
  )
  geometry.setAttribute(
    'normal',
    new BufferAttribute(new Float32Array(normals), 3),
  )
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1))

  return geometry
}
