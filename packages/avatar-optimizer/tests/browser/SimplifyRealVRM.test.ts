/**
 * 実際のVRMファイル（AliciaSolid.vrm）を使用したメッシュ簡略化テスト
 * ブラウザ環境でのmeshoptimizer WASM動作を検証
 */
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import { MeshoptSimplifier } from 'meshoptimizer'
import { Mesh, SkinnedMesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { simplifyMeshes, SimplifyStatistics } from '../../src/process/simplify'

describe('Simplify with Real VRM', () => {
  const VRM_FILE_PATH = '/AliciaSolid.vrm'

  // meshoptimizer WASM の初期化
  beforeAll(async () => {
    await MeshoptSimplifier.ready
  })

  /**
   * VRMファイルをロードするヘルパー関数
   */
  async function loadVRM(): Promise<VRM> {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const response = await fetch(VRM_FILE_PATH)
    const buffer = await response.arrayBuffer()
    const gltf = await loader.parseAsync(buffer, '')
    return gltf.userData.vrm as VRM
  }

  /**
   * VRMから表情メッシュを取得するヘルパー関数
   */
  function getExpressionMeshes(vrm: VRM): Set<Mesh> {
    const expressionMeshes = new Set<Mesh>()
    const expressionManager = vrm.expressionManager
    if (!expressionManager) return expressionMeshes

    for (const expression of expressionManager.expressions) {
      for (const bind of expression.binds) {
        if ('primitives' in bind) {
          // MorphTargetBind
          const morphBind = bind as { primitives: { mesh: Mesh }[] }
          for (const primitive of morphBind.primitives) {
            if (primitive.mesh instanceof Mesh) {
              expressionMeshes.add(primitive.mesh)
            }
          }
        }
      }
    }
    return expressionMeshes
  }

  it('should simplify VRM meshes successfully', async () => {
    const vrm = await loadVRM()
    expect(vrm).toBeDefined()

    // 表情メッシュを除外
    const excludedMeshes = getExpressionMeshes(vrm)

    // 簡略化を実行
    const result = await simplifyMeshes(vrm.scene, excludedMeshes, {
      targetRatio: 0.7,
      targetError: 0.01,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const stats = result.value

      // 基本的な統計情報が存在することを確認
      expect(stats.processedMeshCount).toBeGreaterThanOrEqual(0)
      expect(stats.originalVertexCount).toBeGreaterThan(0)
    }
  })

  it('should reduce vertex count with aggressive settings', async () => {
    const vrm = await loadVRM()
    expect(vrm).toBeDefined()

    // 表情メッシュを除外
    const excludedMeshes = getExpressionMeshes(vrm)

    // 積極的な削減設定
    const result = await simplifyMeshes(vrm.scene, excludedMeshes, {
      targetRatio: 0.3, // 30%に削減
      targetError: 0.1,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const stats = result.value

      // 頂点が削減されていることを確認
      if (stats.processedMeshCount > 0) {
        expect(stats.simplifiedVertexCount).toBeLessThan(stats.originalVertexCount)
        expect(stats.vertexReductionRatio).toBeGreaterThan(0)
      }
    }
  })

  it('should preserve skinning data after simplification', async () => {
    const vrm = await loadVRM()
    expect(vrm).toBeDefined()

    // 簡略化前のSkinnedMesh情報を取得
    const skinnedMeshes: SkinnedMesh[] = []
    vrm.scene.traverse((obj) => {
      if (obj instanceof SkinnedMesh) {
        skinnedMeshes.push(obj)
      }
    })

    expect(skinnedMeshes.length).toBeGreaterThan(0)

    // 表情メッシュを除外
    const excludedMeshes = getExpressionMeshes(vrm)

    // 簡略化を実行
    const result = await simplifyMeshes(vrm.scene, excludedMeshes, {
      targetRatio: 0.8,
      targetError: 0.01,
    })

    expect(result.isOk()).toBe(true)

    // 簡略化後もスキニング属性が保持されていることを確認
    for (const mesh of skinnedMeshes) {
      if (excludedMeshes.has(mesh)) continue

      const geometry = mesh.geometry
      const skinWeight = geometry.getAttribute('skinWeight')
      const skinIndex = geometry.getAttribute('skinIndex')

      // スキニング属性が存在することを確認
      expect(skinWeight, `${mesh.name} should have skinWeight`).toBeDefined()
      expect(skinIndex, `${mesh.name} should have skinIndex`).toBeDefined()

      // スキニング属性の頂点数が位置属性と一致することを確認
      const positionCount = geometry.getAttribute('position').count
      if (skinWeight) {
        expect(skinWeight.count).toBe(positionCount)
      }
      if (skinIndex) {
        expect(skinIndex.count).toBe(positionCount)
      }
    }
  })

  it('should skip expression meshes with MorphTargets', async () => {
    const vrm = await loadVRM()
    expect(vrm).toBeDefined()

    // 全てのメッシュを対象に（除外なし）
    const result = await simplifyMeshes(vrm.scene, new Set(), {
      targetRatio: 0.5,
      targetError: 0.05,
      morphTargetHandling: 'skip', // MorphTarget持ちはスキップ
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const stats = result.value

      // MorphTargetを持つメッシュがスキップされていることを確認
      // AliciaSolidには表情用のMorphTargetがあるはず
      expect(stats.skippedMeshCount).toBeGreaterThan(0)
    }
  })

  it('should handle multiple simplification passes', async () => {
    const vrm = await loadVRM()
    expect(vrm).toBeDefined()

    const excludedMeshes = getExpressionMeshes(vrm)

    // 1回目の簡略化
    const result1 = await simplifyMeshes(vrm.scene, excludedMeshes, {
      targetRatio: 0.8,
      targetError: 0.01,
    })

    expect(result1.isOk()).toBe(true)

    // 2回目の簡略化（さらに削減）
    const result2 = await simplifyMeshes(vrm.scene, excludedMeshes, {
      targetRatio: 0.5,
      targetError: 0.05,
    })

    expect(result2.isOk()).toBe(true)
    if (result2.isOk()) {
      const stats2 = result2.value

      // 2回目も処理できることを確認
      expect(stats2.processedMeshCount).toBeGreaterThanOrEqual(0)
    }
  })

  it('should output detailed statistics', async () => {
    const vrm = await loadVRM()
    expect(vrm).toBeDefined()

    const excludedMeshes = getExpressionMeshes(vrm)

    const result = await simplifyMeshes(vrm.scene, excludedMeshes, {
      targetRatio: 0.5,
      targetError: 0.05,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const stats: SimplifyStatistics = result.value

      // 全ての統計フィールドが存在することを確認
      expect(typeof stats.processedMeshCount).toBe('number')
      expect(typeof stats.skippedMeshCount).toBe('number')
      expect(typeof stats.originalVertexCount).toBe('number')
      expect(typeof stats.simplifiedVertexCount).toBe('number')
      expect(typeof stats.originalIndexCount).toBe('number')
      expect(typeof stats.simplifiedIndexCount).toBe('number')
      expect(typeof stats.vertexReductionRatio).toBe('number')
      expect(typeof stats.indexReductionRatio).toBe('number')

      // 削減率が0-1の範囲内であることを確認
      expect(stats.vertexReductionRatio).toBeGreaterThanOrEqual(0)
      expect(stats.vertexReductionRatio).toBeLessThanOrEqual(1)
      expect(stats.indexReductionRatio).toBeGreaterThanOrEqual(0)
      expect(stats.indexReductionRatio).toBeLessThanOrEqual(1)
    }
  })
})
