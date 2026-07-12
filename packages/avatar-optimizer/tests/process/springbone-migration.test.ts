import {
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
  VRMSpringBoneJoint,
} from '@pixiv/three-vrm'
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'
import { migrateSkeletonVRM0ToVRM1 } from '../../src/util/skeleton'
import {
  rotateSpringBoneColliderOffsets,
  rotateSpringBoneGravityDirections,
} from '../../src/util/springbone'

/**
 * SpringBone物理シミュレーションのマイグレーション前後の挙動をテスト
 *
 * VRM0→VRM1マイグレーションでモデルがY軸180度回転するため、
 * SpringBoneの物理パラメータ（特にgravityDir）も回転する必要がある
 */
describe('springbone-migration', () => {
  /**
   * 簡単なボーン階層とSpringBoneジョイントを作成
   */
  function createSpringBoneSetup(): {
    rootNode: Object3D
    headBone: Bone
    hairBone: Bone
    hairEndBone: Bone
    skeleton: Skeleton
    joint: VRMSpringBoneJoint
    } {
    // ボーン階層を作成（頭→髪の毛→髪の毛末端）
    const rootBone = new Bone()
    rootBone.name = 'root'
    rootBone.position.set(0, 0, 0)

    const headBone = new Bone()
    headBone.name = 'head'
    headBone.position.set(0, 1.5, 0)
    rootBone.add(headBone)

    // 前髪（前方に向かって生えている）
    const hairBone = new Bone()
    hairBone.name = 'hair_front'
    hairBone.position.set(0, 0, 0.1) // Z+方向（VRM0では前方）
    headBone.add(hairBone)

    // 髪の先端
    const hairEndBone = new Bone()
    hairEndBone.name = 'hair_front_end'
    hairEndBone.position.set(0, -0.1, 0.05) // 下に垂れる
    hairBone.add(hairEndBone)

    const bones = [rootBone, headBone, hairBone, hairEndBone]
    const skeleton = new Skeleton(bones)

    // ジオメトリ作成
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    )
    geometry.setAttribute(
      'skinWeight',
      new BufferAttribute(new Float32Array(12).fill(0), 4),
    )
    geometry.setAttribute(
      'skinIndex',
      new BufferAttribute(new Float32Array(12).fill(0), 4),
    )

    const mesh = new SkinnedMesh(geometry)
    mesh.add(rootBone)
    mesh.bind(skeleton)

    const rootNode = new Object3D()
    rootNode.add(mesh)

    // ワールド行列を更新
    rootNode.updateMatrixWorld(true)

    // SpringBoneジョイントを作成
    // 重力方向は下向き（0, -1, 0）
    const joint = new VRMSpringBoneJoint(
      hairBone,
      hairEndBone,
      {
        stiffness: 1.0,
        gravityPower: 0.1,
        gravityDir: new Vector3(0, -1, 0),
        dragForce: 0.4,
        hitRadius: 0,
      },
      [],
    )

    // 初期状態を設定
    joint.setInitState()

    return { rootNode, headBone, hairBone, hairEndBone, skeleton, joint }
  }

  describe('gravityDir rotation', () => {
    it('should keep gravityDir pointing downward after migration', () => {
      const { joint } = createSpringBoneSetup()

      // マイグレーション前の重力方向
      const gravityDirBefore = joint.settings.gravityDir.clone()
      expect(gravityDirBefore.x).toBeCloseTo(0)
      expect(gravityDirBefore.y).toBeCloseTo(-1)
      expect(gravityDirBefore.z).toBeCloseTo(0)

      // VRMをモック（jointをセットとして持つ）
      const mockVRM = {
        springBoneManager: {
          joints: new Set([joint]),
        },
      }

      // 重力方向をY軸180度回転
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotateSpringBoneGravityDirections(mockVRM as any)

      // 回転後の重力方向を確認
      // Y軸180度回転：(x, y, z) → (-x, y, -z)
      // (0, -1, 0) → (0, -1, 0) ← Y軸周りの回転なのでY成分は変わらない
      expect(joint.settings.gravityDir.x).toBeCloseTo(0)
      expect(joint.settings.gravityDir.y).toBeCloseTo(-1)
      expect(joint.settings.gravityDir.z).toBeCloseTo(0)
    })

    it('should correctly rotate non-vertical gravityDir', () => {
      const { joint } = createSpringBoneSetup()

      // 斜め前方への重力（VRM0で前髪を前に引っ張る）
      joint.settings.gravityDir.set(0, -0.7, 0.7).normalize()

      const mockVRM = {
        springBoneManager: {
          joints: new Set([joint]),
        },
      }

      // 重力方向をY軸180度回転
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotateSpringBoneGravityDirections(mockVRM as any)

      // 回転後の重力方向を確認
      // (0, -0.7, 0.7).normalize() ≈ (0, -0.707, 0.707)
      // Y軸180度回転：(0, -0.707, 0.707) → (0, -0.707, -0.707)
      const expected = new Vector3(0, -0.7, -0.7).normalize()
      expect(joint.settings.gravityDir.x).toBeCloseTo(expected.x)
      expect(joint.settings.gravityDir.y).toBeCloseTo(expected.y)
      expect(joint.settings.gravityDir.z).toBeCloseTo(expected.z)
    })

    it('should correctly rotate gravityDir with X component', () => {
      const { joint } = createSpringBoneSetup()

      // 斜め横への重力
      joint.settings.gravityDir.set(0.5, -0.8, 0.2).normalize()

      const originalDir = joint.settings.gravityDir.clone()

      const mockVRM = {
        springBoneManager: {
          joints: new Set([joint]),
        },
      }

      // 重力方向をY軸180度回転
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotateSpringBoneGravityDirections(mockVRM as any)

      // 回転後の重力方向を確認
      // Y軸180度回転：(x, y, z) → (-x, y, -z)
      expect(joint.settings.gravityDir.x).toBeCloseTo(-originalDir.x)
      expect(joint.settings.gravityDir.y).toBeCloseTo(originalDir.y)
      expect(joint.settings.gravityDir.z).toBeCloseTo(-originalDir.z)
    })
  })

  describe('SpringBone physics direction after migration', () => {
    it('should simulate bone movement in correct direction after gravity update', () => {
      const { hairBone, joint } = createSpringBoneSetup()

      // 初期位置を記録
      const initialHairWorldPos = new Vector3()
      hairBone.getWorldPosition(initialHairWorldPos)

      // 物理シミュレーションを1フレーム実行（重力の影響を確認）
      joint.update(1 / 60) // 60FPSの1フレーム

      // 更新後の位置を取得
      const afterUpdatePos = new Vector3()
      hairBone.getWorldPosition(afterUpdatePos)

      // 重力が下向きなので、髪の毛は下に動くはず（または初期状態を維持）
      expect(afterUpdatePos.y).toBeLessThanOrEqual(
        initialHairWorldPos.y + 0.001,
      )
    })

    it('should compare physics behavior before and after migration', () => {
      // マイグレーション前のセットアップ
      const beforeSetup = createSpringBoneSetup()

      // 物理シミュレーションを数フレーム実行
      for (let i = 0; i < 10; i++) {
        beforeSetup.joint.update(1 / 60)
      }

      // マイグレーション前の最終位置を記録
      const beforeMigrationPos = new Vector3()
      beforeSetup.hairBone.getWorldPosition(beforeMigrationPos)

      // 新しいセットアップでマイグレーションを実行
      const afterSetup = createSpringBoneSetup()

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(afterSetup.rootNode)
      expect(result.isOk()).toBe(true)

      // VRMモック
      const mockVRM = {
        springBoneManager: {
          joints: new Set([afterSetup.joint]),
        },
      }

      // 重力方向を回転
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotateSpringBoneGravityDirections(mockVRM as any)

      // SpringBoneの初期状態を再設定（マイグレーション後のボーン姿勢を反映）
      afterSetup.joint.setInitState()

      // 物理シミュレーションを同じフレーム数実行
      for (let i = 0; i < 10; i++) {
        afterSetup.joint.update(1 / 60)
      }

      // マイグレーション後の最終位置を記録
      const afterMigrationPos = new Vector3()
      afterSetup.hairBone.getWorldPosition(afterMigrationPos)

      // 位置の比較（Y軸180度回転を考慮）
      expect(afterMigrationPos.x).toBeCloseTo(-beforeMigrationPos.x, 3)
      expect(afterMigrationPos.y).toBeCloseTo(beforeMigrationPos.y, 3)
      expect(afterMigrationPos.z).toBeCloseTo(-beforeMigrationPos.z, 3)
    })
  })

  describe('collider offset rotation', () => {
    it('should rotate sphere collider offset by Y-axis 180 degrees', () => {
      // 頭ボーンの前方にコライダーを配置（VRM0で顔の前）
      const sphereShape = new VRMSpringBoneColliderShapeSphere({
        offset: new Vector3(0, 0, 0.1), // Z+方向（VRM0の前方）
        radius: 0.05,
      })
      const collider = new VRMSpringBoneCollider(sphereShape)

      // VRMモックを作成
      const mockVRM = {
        springBoneManager: {
          colliders: [collider],
        },
      }

      // 元のオフセットを記録
      const originalOffset = sphereShape.offset.clone()

      // コライダーオフセットをY軸180度回転
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotateSpringBoneColliderOffsets(mockVRM as any)

      // 回転後のオフセットを確認
      // Y軸180度回転: (x, y, z) → (-x, y, -z)
      expect(sphereShape.offset.x).toBeCloseTo(-originalOffset.x)
      expect(sphereShape.offset.y).toBeCloseTo(originalOffset.y)
      expect(sphereShape.offset.z).toBeCloseTo(-originalOffset.z)
    })

    it('should rotate capsule collider offset and tail by Y-axis 180 degrees', () => {
      // 頭ボーンに縦長のカプセルコライダーを配置
      const capsuleShape = new VRMSpringBoneColliderShapeCapsule({
        offset: new Vector3(0.05, 0.1, 0.1), // 右前上
        tail: new Vector3(0.05, -0.1, 0.1), // 右前下
        radius: 0.03,
      })
      const collider = new VRMSpringBoneCollider(capsuleShape)

      const mockVRM = {
        springBoneManager: {
          colliders: [collider],
        },
      }

      const originalOffset = capsuleShape.offset.clone()
      const originalTail = capsuleShape.tail.clone()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotateSpringBoneColliderOffsets(mockVRM as any)

      // offset回転確認
      expect(capsuleShape.offset.x).toBeCloseTo(-originalOffset.x)
      expect(capsuleShape.offset.y).toBeCloseTo(originalOffset.y)
      expect(capsuleShape.offset.z).toBeCloseTo(-originalOffset.z)

      // tail回転確認
      expect(capsuleShape.tail.x).toBeCloseTo(-originalTail.x)
      expect(capsuleShape.tail.y).toBeCloseTo(originalTail.y)
      expect(capsuleShape.tail.z).toBeCloseTo(-originalTail.z)
    })

    it('should handle multiple colliders', () => {
      // 複数のコライダーを作成
      const sphere1 = new VRMSpringBoneColliderShapeSphere({
        offset: new Vector3(0, 0, 0.1),
        radius: 0.05,
      })
      const sphere2 = new VRMSpringBoneColliderShapeSphere({
        offset: new Vector3(0.1, 0, 0),
        radius: 0.03,
      })
      const capsule = new VRMSpringBoneColliderShapeCapsule({
        offset: new Vector3(0, 0.1, 0.05),
        tail: new Vector3(0, -0.1, 0.05),
        radius: 0.02,
      })

      const colliders = [
        new VRMSpringBoneCollider(sphere1),
        new VRMSpringBoneCollider(sphere2),
        new VRMSpringBoneCollider(capsule),
      ]

      const mockVRM = {
        springBoneManager: { colliders },
      }

      const original1 = sphere1.offset.clone()
      const original2 = sphere2.offset.clone()
      const originalCapsuleOffset = capsule.offset.clone()
      const originalCapsuleTail = capsule.tail.clone()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotateSpringBoneColliderOffsets(mockVRM as any)

      // sphere1
      expect(sphere1.offset.x).toBeCloseTo(-original1.x)
      expect(sphere1.offset.z).toBeCloseTo(-original1.z)

      // sphere2
      expect(sphere2.offset.x).toBeCloseTo(-original2.x)
      expect(sphere2.offset.z).toBeCloseTo(-original2.z)

      // capsule offset
      expect(capsule.offset.x).toBeCloseTo(-originalCapsuleOffset.x)
      expect(capsule.offset.z).toBeCloseTo(-originalCapsuleOffset.z)

      // capsule tail
      expect(capsule.tail.x).toBeCloseTo(-originalCapsuleTail.x)
      expect(capsule.tail.z).toBeCloseTo(-originalCapsuleTail.z)
    })

    it('should preserve collider world position after skeleton migration', () => {
      // ボーン階層を作成
      const { rootNode, headBone } = createSpringBoneSetup()

      // 頭の前方にコライダーを配置（VRM0では顔の前）
      const sphereShape = new VRMSpringBoneColliderShapeSphere({
        offset: new Vector3(0, 0, 0.1), // Z+方向（VRM0の前方）に10cm
        radius: 0.05,
      })
      const collider = new VRMSpringBoneCollider(sphereShape)
      headBone.add(collider)
      rootNode.updateMatrixWorld(true)

      // マイグレーション前のコライダーワールド位置を計算
      // offset + ボーンのワールド位置
      const headWorldPos = new Vector3()
      headBone.getWorldPosition(headWorldPos)
      const colliderWorldPosBefore = headWorldPos
        .clone()
        .add(sphereShape.offset)

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode)
      expect(result.isOk()).toBe(true)

      // コライダーオフセットを回転
      const mockVRM = {
        springBoneManager: {
          colliders: [collider],
        },
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotateSpringBoneColliderOffsets(mockVRM as any)

      // マイグレーション後のコライダーワールド位置を計算
      rootNode.updateMatrixWorld(true)
      const headWorldPosAfter = new Vector3()
      headBone.getWorldPosition(headWorldPosAfter)
      const colliderWorldPosAfter = headWorldPosAfter
        .clone()
        .add(sphereShape.offset)

      // ワールド位置はY軸180度回転しているはず
      // (x, y, z) → (-x, y, -z)
      expect(colliderWorldPosAfter.x).toBeCloseTo(-colliderWorldPosBefore.x)
      expect(colliderWorldPosAfter.y).toBeCloseTo(colliderWorldPosBefore.y)
      expect(colliderWorldPosAfter.z).toBeCloseTo(-colliderWorldPosBefore.z)
    })

    it('should update colliderMatrix correctly after offset rotation', () => {
      // ボーン階層を作成
      const { rootNode, headBone } = createSpringBoneSetup()

      // 頭の前方にコライダーを配置
      const sphereShape = new VRMSpringBoneColliderShapeSphere({
        offset: new Vector3(0, 0, 0.1),
        radius: 0.05,
      })
      const collider = new VRMSpringBoneCollider(sphereShape)
      headBone.add(collider)

      // updateWorldMatrixでcolliderMatrixを更新
      collider.updateWorldMatrix(true, false)

      // マイグレーション前のcolliderMatrixからワールド位置を取得
      const colliderWorldPosBefore = new Vector3().setFromMatrixPosition(
        collider.colliderMatrix,
      )

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode)
      expect(result.isOk()).toBe(true)

      // コライダーオフセットを回転
      const mockVRM = {
        springBoneManager: {
          colliders: [collider],
        },
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotateSpringBoneColliderOffsets(mockVRM as any)

      // updateWorldMatrixでcolliderMatrixを再計算
      collider.updateWorldMatrix(true, false)

      // マイグレーション後のcolliderMatrixからワールド位置を取得
      const colliderWorldPosAfter = new Vector3().setFromMatrixPosition(
        collider.colliderMatrix,
      )

      // ワールド位置はY軸180度回転しているはず
      expect(colliderWorldPosAfter.x).toBeCloseTo(-colliderWorldPosBefore.x)
      expect(colliderWorldPosAfter.y).toBeCloseTo(colliderWorldPosBefore.y)
      expect(colliderWorldPosAfter.z).toBeCloseTo(-colliderWorldPosBefore.z)
    })
  })
})
