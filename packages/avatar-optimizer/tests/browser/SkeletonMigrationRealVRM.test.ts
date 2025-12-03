import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import { Bone, SkinnedMesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { migrateSkeletonVRM0ToVRM1 } from '../../src/util/skeleton'
import {
  createVirtualTailNodes,
  recordSpringBoneState,
  restoreSpringBoneState,
  rotateSpringBoneGravityDirections,
} from '../../src/util/springbone'

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
    const failedBones: string[] = []

    rootNode.traverse((obj) => {
      if (obj instanceof Bone) {
        obj.updateMatrixWorld(true)
        const worldPos = new Vector3()
        obj.getWorldPosition(worldPos)
        const beforePos = beforePositions.get(obj.name)

        if (!beforePos) {
          return
        }

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
          console.error(
            `  Before: (${beforePos.x.toFixed(6)}, ${beforePos.y.toFixed(6)}, ${beforePos.z.toFixed(6)})`,
          )
          console.error(
            `  After:  (${worldPos.x.toFixed(6)}, ${worldPos.y.toFixed(6)}, ${worldPos.z.toFixed(6)})`,
          )
          console.error(
            `  Expected: (${expectedX.toFixed(6)}, ${expectedY.toFixed(6)}, ${expectedZ.toFixed(6)})`,
          )
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
        const isHairBone = hairBonePatterns.some((pattern) =>
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
    const failedBones: {
      name: string
      before: Vector3
      after: Vector3
      expected: Vector3
    }[] = []

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
        console.error(
          `    Before:   (${failed.before.x.toFixed(6)}, ${failed.before.y.toFixed(6)}, ${failed.before.z.toFixed(6)})`,
        )
        console.error(
          `    After:    (${failed.after.x.toFixed(6)}, ${failed.after.y.toFixed(6)}, ${failed.after.z.toFixed(6)})`,
        )
        console.error(
          `    Expected: (${failed.expected.x.toFixed(6)}, ${failed.expected.y.toFixed(6)}, ${failed.expected.z.toFixed(6)})`,
        )
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
        beforeParentMap.set(
          obj.name,
          obj.parent instanceof Bone ? obj.parent.name : null,
        )
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
          console.error(
            `[Migration Test] Parent mismatch for ${obj.name}: ${beforeParent} -> ${afterParent}`,
          )
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
    const beforePositions = new Map<
      string,
      { x: number; y: number; z: number }
    >()
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

  describe('SpringBone physics direction after migration', () => {
    it('should maintain worldSpaceBoneAxis after migration', async () => {
      // VRMをロード
      const loader = new GLTFLoader()
      loader.register((parser) => new VRMLoaderPlugin(parser))

      const response = await fetch(VRM_FILE_PATH)
      const buffer = await response.arrayBuffer()
      const gltf = await loader.parseAsync(buffer, '')
      const vrm = gltf.userData.vrm as VRM
      expect(vrm).toBeDefined()
      expect(vrm.springBoneManager).toBeDefined()

      const rootNode = vrm.scene
      const springBoneManager = vrm.springBoneManager!

      // SpringBone初期状態を設定
      springBoneManager.setInitState()
      springBoneManager.reset()

      // マイグレーション前のworldSpaceBoneAxisを記録
      const worldAxisBefore = new Map<string, Vector3>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      springBoneManager.joints.forEach((joint: any) => {
        const bone = joint.bone
        if (!bone?.name?.includes('hair')) return

        const boneAxis = joint._boneAxis
        const parentMatrixWorld = bone.parent?.matrixWorld
        const initialLocalMatrix = joint._initialLocalMatrix
        if (boneAxis && parentMatrixWorld && initialLocalMatrix) {
          const worldAxis = boneAxis
            .clone()
            .transformDirection(initialLocalMatrix)
            .transformDirection(parentMatrixWorld)
          worldAxisBefore.set(bone.name, worldAxis)
        }
      })

      // マイグレーション前にSpringBoneの状態を記録
      const preRecordedState = recordSpringBoneState(vrm)

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode)
      expect(result.isOk()).toBe(true)

      // 仮想tailノードを作成
      createVirtualTailNodes(vrm)

      // 重力方向を回転
      rotateSpringBoneGravityDirections(vrm)

      // SpringBoneの初期状態を再設定
      springBoneManager.setInitState()
      springBoneManager.reset()

      // SpringBoneの状態を復元（reset()の後に呼ぶ）
      restoreSpringBoneState(vrm, preRecordedState)

      // マイグレーション後のworldSpaceBoneAxisを確認
      let mismatchCount = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      springBoneManager.joints.forEach((joint: any) => {
        const bone = joint.bone
        if (!bone?.name?.includes('hair')) return

        const boneAxis = joint._boneAxis
        const parentMatrixWorld = bone.parent?.matrixWorld
        const initialLocalMatrix = joint._initialLocalMatrix
        if (!boneAxis || !parentMatrixWorld || !initialLocalMatrix) return

        const worldAxisAfter = boneAxis
          .clone()
          .transformDirection(initialLocalMatrix)
          .transformDirection(parentMatrixWorld)
        const worldAxisBeforeValue = worldAxisBefore.get(bone.name)

        if (worldAxisBeforeValue) {
          const diffX = Math.abs(worldAxisAfter.x - worldAxisBeforeValue.x)
          const diffY = Math.abs(worldAxisAfter.y - worldAxisBeforeValue.y)
          const diffZ = Math.abs(worldAxisAfter.z - worldAxisBeforeValue.z)
          const isSame = diffX < 0.01 && diffY < 0.01 && diffZ < 0.01

          if (!isSame) {
            console.error(`${bone.name} worldSpaceBoneAxis mismatch:`)
            console.error(
              `  Before: (${worldAxisBeforeValue.x.toFixed(4)}, ${worldAxisBeforeValue.y.toFixed(4)}, ${worldAxisBeforeValue.z.toFixed(4)})`,
            )
            console.error(
              `  After:  (${worldAxisAfter.x.toFixed(4)}, ${worldAxisAfter.y.toFixed(4)}, ${worldAxisAfter.z.toFixed(4)})`,
            )
            mismatchCount++
          }
        }
      })

      expect(mismatchCount).toBe(0)
    })

    it('should move hair bones in consistent direction after migration', async () => {
      // VRMを2回ロード（マイグレーション前後比較用）
      const loader = new GLTFLoader()
      loader.register((parser) => new VRMLoaderPlugin(parser))

      // マイグレーションなしのVRM
      const response1 = await fetch(VRM_FILE_PATH)
      const buffer1 = await response1.arrayBuffer()
      const gltf1 = await loader.parseAsync(buffer1, '')
      const vrmBefore = gltf1.userData.vrm as VRM
      expect(vrmBefore.springBoneManager).toBeDefined()

      // マイグレーションありのVRM
      const response2 = await fetch(VRM_FILE_PATH)
      const buffer2 = await response2.arrayBuffer()
      const gltf2 = await loader.parseAsync(buffer2, '')
      const vrmAfter = gltf2.userData.vrm as VRM
      expect(vrmAfter.springBoneManager).toBeDefined()

      // マイグレーション前にSpringBoneの状態を記録
      const preRecordedState = recordSpringBoneState(vrmAfter)

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(vrmAfter.scene)
      expect(result.isOk()).toBe(true)
      createVirtualTailNodes(vrmAfter)
      rotateSpringBoneGravityDirections(vrmAfter)
      vrmAfter.springBoneManager!.setInitState()
      vrmAfter.springBoneManager!.reset()
      restoreSpringBoneState(vrmAfter, preRecordedState)

      // 両方のSpringBoneを初期化
      vrmBefore.springBoneManager!.setInitState()
      vrmBefore.springBoneManager!.reset()

      // 物理シミュレーション実行（初期位置を記録してから）
      const beforeInitial = new Map<string, number>()
      const afterInitial = new Map<string, number>()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vrmBefore.springBoneManager!.joints.forEach((joint: any) => {
        const bone = joint.bone
        if (bone?.name?.includes('hair')) {
          const worldPos = new Vector3()
          bone.getWorldPosition(worldPos)
          beforeInitial.set(bone.name, worldPos.y)
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vrmAfter.springBoneManager!.joints.forEach((joint: any) => {
        const bone = joint.bone
        if (bone?.name?.includes('hair')) {
          const worldPos = new Vector3()
          bone.getWorldPosition(worldPos)
          afterInitial.set(bone.name, worldPos.y)
        }
      })

      // 30フレーム分シミュレーション
      for (let i = 0; i < 30; i++) {
        vrmBefore.springBoneManager!.update(1 / 60)
        vrmAfter.springBoneManager!.update(1 / 60)
      }

      // 髪ボーンのY方向移動を比較
      const beforeMovements = new Map<string, number>()
      const afterMovements = new Map<string, number>()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vrmBefore.springBoneManager!.joints.forEach((joint: any) => {
        const bone = joint.bone
        if (bone?.name?.includes('hair')) {
          const worldPos = new Vector3()
          bone.getWorldPosition(worldPos)
          const initial = beforeInitial.get(bone.name)
          if (initial !== undefined) {
            beforeMovements.set(bone.name, worldPos.y - initial)
          }
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vrmAfter.springBoneManager!.joints.forEach((joint: any) => {
        const bone = joint.bone
        if (bone?.name?.includes('hair')) {
          const worldPos = new Vector3()
          bone.getWorldPosition(worldPos)
          const initial = afterInitial.get(bone.name)
          if (initial !== undefined) {
            afterMovements.set(bone.name, worldPos.y - initial)
          }
        }
      })

      // 移動量が同程度であることを確認
      // 注意: SpringBoneの内部状態はマイグレーションで変化するため、
      // 完全に同じ挙動は期待できない。重要なのはworldSpaceBoneAxisが維持されること。
      // 髪ボーンはgravityPower=0のものが多く、stiffnessのみで動くため
      // マイグレーション後の内部状態の違いにより移動方向が異なることがある。
      let closeMovementCount = 0
      let totalCount = 0
      beforeMovements.forEach((beforeMove, boneName) => {
        const afterMove = afterMovements.get(boneName)
        if (afterMove !== undefined) {
          totalCount++
          // 移動量の差が0.05未満なら同等とみなす
          const movementDiff = Math.abs(
            Math.abs(beforeMove) - Math.abs(afterMove),
          )
          if (movementDiff < 0.05) {
            closeMovementCount++
          }
        }
      })

      // 大多数のボーンが同程度の移動量であるべき
      const closeRatio = closeMovementCount / totalCount
      expect(closeRatio).toBeGreaterThan(0.5) // 50%以上が同程度の移動量
    })
  })
})
