import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import { Bone, SkinnedMesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { migrateSkeletonVRM0ToVRM1 } from '../../src/util/skeleton'

/**
 * 実際のVRMファイル（AliciaSolid.vrm）を使ったスケルトンマイグレーションテスト
 * VRM0.x -> VRM1.0形式への変換時のボーンワールド座標の正確性を検証
 */
describe('Skeleton Migration with Real VRM', () => {
  const VRM_FILE_PATH = '/AliciaSolid.vrm'

  it('should correctly rotate all bone world positions by 180 degrees around Y axis', async () => {
    // VRMをロード
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const response = await fetch(VRM_FILE_PATH)
    const buffer = await response.arrayBuffer()
    const gltf = await loader.parseAsync(buffer, '')
    const vrm = gltf.userData.vrm as VRM
    expect(vrm).toBeDefined()

    const rootNode = vrm.scene

    // マイグレーション前のワールド座標を記録
    const beforePositions = new Map<string, Vector3>()
    rootNode.traverse((obj) => {
      if (obj instanceof Bone) {
        obj.updateMatrixWorld(true)
        const worldPos = new Vector3()
        obj.getWorldPosition(worldPos)
        beforePositions.set(obj.name, worldPos.clone())
      }
    })

    // マイグレーション実行
    const result = migrateSkeletonVRM0ToVRM1(rootNode)
    expect(result.isOk()).toBe(true)

    // マイグレーション後のワールド座標を確認
    let testedBones = 0
    const failedBones: string[] = []

    rootNode.traverse((obj) => {
      if (obj instanceof Bone) {
        obj.updateMatrixWorld(true)
        const worldPos = new Vector3()
        obj.getWorldPosition(worldPos)
        const beforePos = beforePositions.get(obj.name)

        if (!beforePos) {
          console.warn(`[Migration Test] Bone ${obj.name} not found in before positions`)
          return
        }

        testedBones++

        // Y軸180度回転後の期待値：X -> -X, Z -> -Z, Y -> Y
        const expectedX = -beforePos.x
        const expectedY = beforePos.y
        const expectedZ = -beforePos.z

        const tolerance = 1e-4

        const xOk = Math.abs(worldPos.x - expectedX) < tolerance
        const yOk = Math.abs(worldPos.y - expectedY) < tolerance
        const zOk = Math.abs(worldPos.z - expectedZ) < tolerance

        if (!xOk || !yOk || !zOk) {
          failedBones.push(obj.name)
          console.error(`[Migration Test] ${obj.name} position mismatch:`)
          console.error(`  Before: (${beforePos.x.toFixed(6)}, ${beforePos.y.toFixed(6)}, ${beforePos.z.toFixed(6)})`)
          console.error(`  After:  (${worldPos.x.toFixed(6)}, ${worldPos.y.toFixed(6)}, ${worldPos.z.toFixed(6)})`)
          console.error(`  Expected: (${expectedX.toFixed(6)}, ${expectedY.toFixed(6)}, ${expectedZ.toFixed(6)})`)
        }
      }
    })

    expect(failedBones).toHaveLength(0)
  })

  it('should correctly rotate hair bones (above Head)', async () => {
    // VRMをロード
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const response = await fetch(VRM_FILE_PATH)
    const buffer = await response.arrayBuffer()
    const gltf = await loader.parseAsync(buffer, '')
    const vrm = gltf.userData.vrm as VRM
    expect(vrm).toBeDefined()

    const rootNode = vrm.scene

    // 髪の毛関連のボーン名パターン
    const hairBonePatterns = ['hair', 'mituami', 'ribbon']

    // マイグレーション前のワールド座標を記録（髪の毛ボーンのみ）
    const beforePositions = new Map<string, Vector3>()
    rootNode.traverse((obj) => {
      if (obj instanceof Bone) {
        const isHairBone = hairBonePatterns.some(pattern =>
          obj.name.toLowerCase().includes(pattern),
        )
        if (isHairBone) {
          obj.updateMatrixWorld(true)
          const worldPos = new Vector3()
          obj.getWorldPosition(worldPos)
          beforePositions.set(obj.name, worldPos.clone())
        }
      }
    })

    // マイグレーション実行
    const result = migrateSkeletonVRM0ToVRM1(rootNode)
    expect(result.isOk()).toBe(true)

    // マイグレーション後のワールド座標を確認
    const failedBones: { name: string; before: Vector3; after: Vector3; expected: Vector3 }[] = []

    rootNode.traverse((obj) => {
      if (obj instanceof Bone) {
        const beforePos = beforePositions.get(obj.name)
        if (!beforePos) return

        obj.updateMatrixWorld(true)
        const worldPos = new Vector3()
        obj.getWorldPosition(worldPos)

        // Y軸180度回転後の期待値
        const expectedX = -beforePos.x
        const expectedY = beforePos.y
        const expectedZ = -beforePos.z

        const tolerance = 1e-4

        const xOk = Math.abs(worldPos.x - expectedX) < tolerance
        const yOk = Math.abs(worldPos.y - expectedY) < tolerance
        const zOk = Math.abs(worldPos.z - expectedZ) < tolerance

        if (!xOk || !yOk || !zOk) {
          failedBones.push({
            name: obj.name,
            before: beforePos.clone(),
            after: worldPos.clone(),
            expected: new Vector3(expectedX, expectedY, expectedZ),
          })
        }
      }
    })

    if (failedBones.length > 0) {
      console.error(`[Migration Test] ${failedBones.length} hair bones failed:`)
      for (const failed of failedBones) {
        console.error(`  ${failed.name}:`)
        console.error(`    Before:   (${failed.before.x.toFixed(6)}, ${failed.before.y.toFixed(6)}, ${failed.before.z.toFixed(6)})`)
        console.error(`    After:    (${failed.after.x.toFixed(6)}, ${failed.after.y.toFixed(6)}, ${failed.after.z.toFixed(6)})`)
        console.error(`    Expected: (${failed.expected.x.toFixed(6)}, ${failed.expected.y.toFixed(6)}, ${failed.expected.z.toFixed(6)})`)
      }
    }

    expect(failedBones).toHaveLength(0)
  })

  it('should maintain bone parent-child relationships after migration', async () => {
    // VRMをロード
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const response = await fetch(VRM_FILE_PATH)
    const buffer = await response.arrayBuffer()
    const gltf = await loader.parseAsync(buffer, '')
    const vrm = gltf.userData.vrm as VRM
    expect(vrm).toBeDefined()

    const rootNode = vrm.scene

    // マイグレーション前の親子関係を記録
    const beforeParentMap = new Map<string, string | null>()
    rootNode.traverse((obj) => {
      if (obj instanceof Bone) {
        beforeParentMap.set(obj.name, obj.parent instanceof Bone ? obj.parent.name : null)
      }
    })

    // マイグレーション実行
    const result = migrateSkeletonVRM0ToVRM1(rootNode)
    expect(result.isOk()).toBe(true)

    // マイグレーション後の親子関係を確認
    let mismatchCount = 0
    rootNode.traverse((obj) => {
      if (obj instanceof Bone) {
        const beforeParent = beforeParentMap.get(obj.name)
        const afterParent = obj.parent instanceof Bone ? obj.parent.name : null

        if (beforeParent !== afterParent) {
          console.error(`[Migration Test] Parent mismatch for ${obj.name}: ${beforeParent} -> ${afterParent}`)
          mismatchCount++
        }
      }
    })

    expect(mismatchCount).toBe(0)
  })

  it('should correctly rotate raw vertex positions after migration', async () => {
    // VRMをロード
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const response = await fetch(VRM_FILE_PATH)
    const buffer = await response.arrayBuffer()
    const gltf = await loader.parseAsync(buffer, '')
    const vrm = gltf.userData.vrm as VRM
    expect(vrm).toBeDefined()

    const rootNode = vrm.scene

    // SkinnedMeshを収集
    const skinnedMeshes: SkinnedMesh[] = []
    rootNode.traverse((obj) => {
      if (obj instanceof SkinnedMesh) {
        skinnedMeshes.push(obj)
      }
    })
    expect(skinnedMeshes.length).toBeGreaterThan(0)

    // マイグレーション前の生の頂点位置を記録
    const beforePositions = new Map<string, { x: number; y: number; z: number }>()
    for (const mesh of skinnedMeshes) {
      const pos = mesh.geometry.getAttribute('position')
      beforePositions.set(mesh.name, {
        x: pos.getX(0),
        y: pos.getY(0),
        z: pos.getZ(0),
      })
    }

    // マイグレーション実行
    const result = migrateSkeletonVRM0ToVRM1(rootNode)
    expect(result.isOk()).toBe(true)

    // マイグレーション後の生の頂点位置を確認
    const failedMeshes: string[] = []
    for (const mesh of skinnedMeshes) {
      const pos = mesh.geometry.getAttribute('position')
      const before = beforePositions.get(mesh.name)!
      const afterX = pos.getX(0)
      const afterY = pos.getY(0)
      const afterZ = pos.getZ(0)

      // Y軸180度回転後の期待値: X -> -X, Z -> -Z, Y -> Y
      const expectedX = -before.x
      const expectedY = before.y
      const expectedZ = -before.z

      const tolerance = 1e-4
      const xOk = Math.abs(afterX - expectedX) < tolerance
      const yOk = Math.abs(afterY - expectedY) < tolerance
      const zOk = Math.abs(afterZ - expectedZ) < tolerance

      if (!xOk || !yOk || !zOk) {
        failedMeshes.push(mesh.name)
      }
    }

    expect(failedMeshes).toHaveLength(0)
  })
})
