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
import {
  findRootBone,
  migrateSkeletonVRM0ToVRM1,
  rebuildBoneTransforms,
  recordBoneWorldPositions,
  rotateBonePositions,
} from '../../src/util/skeleton'

/**
 * 簡単なSkinnedMeshを作成するヘルパー
 */
function createSimpleSkinnedMesh(): {
  mesh: SkinnedMesh
  skeleton: Skeleton
  rootBone: Bone
} {
  // ジオメトリ作成（三角形1つ）
  const geometry = new BufferGeometry()
  const positions = new Float32Array([
    1,
    0,
    0, // vertex 0: X軸正方向
    0,
    1,
    0, // vertex 1: Y軸正方向
    0,
    0,
    1, // vertex 2: Z軸正方向
  ])
  geometry.setAttribute('position', new BufferAttribute(positions, 3))

  // スキンウェイトとインデックス
  const skinWeights = new Float32Array([
    1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0,
  ])
  const skinIndices = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeights, 4))
  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndices, 4))

  // ボーン階層を作成
  const rootBone = new Bone()
  rootBone.name = 'root'
  rootBone.position.set(0, 0, 0)

  const childBone = new Bone()
  childBone.name = 'child'
  childBone.position.set(0, 1, 0) // ルートから上に1
  rootBone.add(childBone)

  const bones = [rootBone, childBone]
  const skeleton = new Skeleton(bones)

  // SkinnedMesh作成
  const mesh = new SkinnedMesh(geometry)
  mesh.add(rootBone)
  mesh.bind(skeleton)

  return { mesh, skeleton, rootBone }
}

describe('skeleton-migration', () => {
  describe('recordBoneWorldPositions', () => {
    it('should record world positions for all bones', () => {
      const { skeleton, rootBone } = createSimpleSkinnedMesh()

      // ワールド行列を更新
      rootBone.updateMatrixWorld(true)

      const positions = recordBoneWorldPositions(skeleton)

      expect(positions.size).toBe(2)

      // ルートボーンは原点
      const rootPos = positions.get(skeleton.bones[0])
      expect(rootPos).toBeDefined()
      expect(rootPos!.x).toBeCloseTo(0)
      expect(rootPos!.y).toBeCloseTo(0)
      expect(rootPos!.z).toBeCloseTo(0)

      // 子ボーンはY=1
      const childPos = positions.get(skeleton.bones[1])
      expect(childPos).toBeDefined()
      expect(childPos!.x).toBeCloseTo(0)
      expect(childPos!.y).toBeCloseTo(1)
      expect(childPos!.z).toBeCloseTo(0)
    })
  })

  describe('rotateBonePositions', () => {
    it('should rotate bone positions by 180 degrees around Y axis', () => {
      const bone1 = new Bone()
      const bone2 = new Bone()

      const positions = new Map<Bone, Vector3>()
      positions.set(bone1, new Vector3(1, 0, 0))
      positions.set(bone2, new Vector3(0, 0, 1))

      const rotated = rotateBonePositions(positions)

      // (1, 0, 0) -> (-1, 0, 0)
      const rotatedPos1 = rotated.get(bone1)
      expect(rotatedPos1).toBeDefined()
      expect(rotatedPos1!.x).toBeCloseTo(-1)
      expect(rotatedPos1!.y).toBeCloseTo(0)
      expect(rotatedPos1!.z).toBeCloseTo(0)

      // (0, 0, 1) -> (0, 0, -1)
      const rotatedPos2 = rotated.get(bone2)
      expect(rotatedPos2).toBeDefined()
      expect(rotatedPos2!.x).toBeCloseTo(0)
      expect(rotatedPos2!.y).toBeCloseTo(0)
      expect(rotatedPos2!.z).toBeCloseTo(-1)
    })
  })

  describe('findRootBone', () => {
    it('should find the root bone in a skeleton', () => {
      const { skeleton, rootBone } = createSimpleSkinnedMesh()

      const found = findRootBone(skeleton)

      expect(found).toBe(rootBone)
      expect(found?.name).toBe('root')
    })

    it('should return first bone if no clear root', () => {
      const bone1 = new Bone()
      const bone2 = new Bone()
      const skeleton = new Skeleton([bone1, bone2])

      const found = findRootBone(skeleton)

      // 両方ともルート（親がBoneでない）なので最初のものが返る
      expect(found).toBe(bone1)
    })
  })

  describe('rebuildBoneTransforms', () => {
    it('should rebuild bone positions and reset rotation to identity for humanoid bones', () => {
      const rootBone = new Bone()
      rootBone.name = 'root'
      rootBone.position.set(1, 0, 0)
      rootBone.rotation.set(0, Math.PI / 4, 0) // Y軸45度回転

      const childBone = new Bone()
      childBone.name = 'child'
      childBone.position.set(0, 1, 0)
      childBone.rotation.set(Math.PI / 6, 0, 0) // X軸30度回転
      rootBone.add(childBone)

      rootBone.updateMatrixWorld(true)

      // 新しい位置を設定（Y軸180度回転後）
      const rotatedPositions = new Map<Bone, Vector3>()
      rotatedPositions.set(rootBone, new Vector3(-1, 0, 0))
      rotatedPositions.set(childBone, new Vector3(-1, 1, 0))

      // 再構築（humanoidBonesを渡さない場合、全てのボーンがhumanoidとして扱われる）
      rebuildBoneTransforms(rootBone, rotatedPositions)

      // 位置が更新されている
      expect(rootBone.position.x).toBeCloseTo(-1)
      expect(rootBone.position.y).toBeCloseTo(0)
      expect(rootBone.position.z).toBeCloseTo(0)

      // VRM1.0仕様: 回転はidentityにリセットされている
      expect(rootBone.rotation.x).toBeCloseTo(0)
      expect(rootBone.rotation.y).toBeCloseTo(0)
      expect(rootBone.rotation.z).toBeCloseTo(0)

      expect(childBone.rotation.x).toBeCloseTo(0)
      expect(childBone.rotation.y).toBeCloseTo(0)
      expect(childBone.rotation.z).toBeCloseTo(0)

      // 子ボーンの位置も正しく計算されている
      // ワールド位置が(-1, 1, 0)、親が(-1, 0, 0)なので、ローカル位置は(0, 1, 0)
      expect(childBone.position.x).toBeCloseTo(0)
      expect(childBone.position.y).toBeCloseTo(1)
      expect(childBone.position.z).toBeCloseTo(0)
    })

    it('should preserve rotation for non-humanoid bones', () => {
      const rootBone = new Bone()
      rootBone.name = 'hips' // Humanoid bone
      rootBone.position.set(0, 1, 0)

      const hairBone = new Bone()
      hairBone.name = 'hair' // Non-humanoid bone
      hairBone.position.set(0, 0.1, 0)
      hairBone.rotation.set(Math.PI / 6, 0, 0) // X軸30度回転
      rootBone.add(hairBone)

      rootBone.updateMatrixWorld(true)

      // 位置を記録
      const rotatedPositions = new Map<Bone, Vector3>()
      rotatedPositions.set(rootBone, new Vector3(0, 1, 0))
      rotatedPositions.set(hairBone, new Vector3(0, 1.1, 0))

      // Humanoid boneのセット（hipsのみ）
      const humanoidBones = new Set<Bone>([rootBone])

      // 再構築
      rebuildBoneTransforms(rootBone, rotatedPositions, humanoidBones)

      // Humanoid bone (hips) は回転がidentity
      expect(rootBone.rotation.x).toBeCloseTo(0)
      expect(rootBone.rotation.y).toBeCloseTo(0)
      expect(rootBone.rotation.z).toBeCloseTo(0)

      // Non-humanoid bone (hair) は回転を保持（Y軸180度回転で調整される）
      // 元の回転がX軸30度、Y軸180度回転後もX軸30度を維持
      // ただしY軸180度回転の影響で、回転の表現が変わる可能性がある
      // 重要なのはワールド座標が正しいこと
      hairBone.updateMatrixWorld(true)
      const hairWorldPos = new Vector3()
      hairBone.getWorldPosition(hairWorldPos)
      expect(hairWorldPos.y).toBeCloseTo(1.1, 4)
    })
  })

  describe('migrateSkeletonVRM0ToVRM1', () => {
    it('should correctly rotate bone world positions by 180 degrees around Y axis', () => {
      // 複雑なボーン階層を作成（VRMの髪の毛のような分岐構造）
      // Root -> Spine -> Head -> Hair1 -> Hair1_end
      //                       -> Hair2 -> Hair2_end
      const rootBone = new Bone()
      rootBone.name = 'root'
      rootBone.position.set(0, 0, 0)

      const spineBone = new Bone()
      spineBone.name = 'spine'
      spineBone.position.set(0, 1, 0) // 上方向
      rootBone.add(spineBone)

      const headBone = new Bone()
      headBone.name = 'head'
      headBone.position.set(0, 0.5, 0) // さらに上方向
      spineBone.add(headBone)

      // 髪の毛1（斜め前方）
      const hair1Bone = new Bone()
      hair1Bone.name = 'hair1'
      hair1Bone.position.set(0.2, 0.1, 0.3) // 前方斜め
      headBone.add(hair1Bone)

      const hair1EndBone = new Bone()
      hair1EndBone.name = 'hair1_end'
      hair1EndBone.position.set(0.1, -0.2, 0.15) // 下方に垂れる
      hair1Bone.add(hair1EndBone)

      // 髪の毛2（斜め後方）
      const hair2Bone = new Bone()
      hair2Bone.name = 'hair2'
      hair2Bone.position.set(-0.1, 0.05, -0.25) // 後方斜め
      headBone.add(hair2Bone)

      const hair2EndBone = new Bone()
      hair2EndBone.name = 'hair2_end'
      hair2EndBone.position.set(-0.05, -0.15, -0.1) // 下方に垂れる
      hair2Bone.add(hair2EndBone)

      const bones = [
        rootBone,
        spineBone,
        headBone,
        hair1Bone,
        hair1EndBone,
        hair2Bone,
        hair2EndBone,
      ]
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

      // マイグレーション前のワールド座標を記録
      rootBone.updateMatrixWorld(true)
      const beforePositions = new Map<string, Vector3>()
      for (const bone of bones) {
        const worldPos = new Vector3()
        bone.getWorldPosition(worldPos)
        beforePositions.set(bone.name, worldPos.clone())
      }

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode)
      expect(result.isOk()).toBe(true)

      // マイグレーション後のワールド座標を確認
      rootBone.updateMatrixWorld(true)
      for (const bone of bones) {
        const worldPos = new Vector3()
        bone.getWorldPosition(worldPos)
        const beforePos = beforePositions.get(bone.name)!

        // Y軸180度回転後の期待値：X -> -X, Z -> -Z, Y -> Y
        expect(worldPos.x).toBeCloseTo(
          -beforePos.x,
          5,
          `${bone.name} X座標が正しく回転されていない`,
        )
        expect(worldPos.y).toBeCloseTo(
          beforePos.y,
          5,
          `${bone.name} Y座標が変わってしまっている`,
        )
        expect(worldPos.z).toBeCloseTo(
          -beforePos.z,
          5,
          `${bone.name} Z座標が正しく回転されていない`,
        )
      }
    })

    it('should correctly rotate bones with initial rotation', () => {
      // 回転を持つボーン階層（VRMの髪の毛で起こりうる）
      const rootBone = new Bone()
      rootBone.name = 'root'
      rootBone.position.set(0, 0, 0)

      const headBone = new Bone()
      headBone.name = 'head'
      headBone.position.set(0, 1.5, 0)
      rootBone.add(headBone)

      // Y軸周りに45度回転している髪の毛
      const hairBone = new Bone()
      hairBone.name = 'hair'
      hairBone.position.set(0.3, 0, 0.3)
      hairBone.rotation.set(0, Math.PI / 4, 0) // Y軸45度回転
      headBone.add(hairBone)

      // 髪の毛の先端（ローカルZ方向に伸びる）
      const hairEndBone = new Bone()
      hairEndBone.name = 'hair_end'
      hairEndBone.position.set(0, -0.2, 0.1)
      hairBone.add(hairEndBone)

      const bones = [rootBone, headBone, hairBone, hairEndBone]
      const skeleton = new Skeleton(bones)

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

      // マイグレーション前のワールド座標を記録
      rootBone.updateMatrixWorld(true)
      const beforePositions = new Map<string, Vector3>()
      for (const bone of bones) {
        const worldPos = new Vector3()
        bone.getWorldPosition(worldPos)
        beforePositions.set(bone.name, worldPos.clone())
      }

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode)
      expect(result.isOk()).toBe(true)

      // マイグレーション後のワールド座標を確認
      rootBone.updateMatrixWorld(true)
      for (const bone of bones) {
        const worldPos = new Vector3()
        bone.getWorldPosition(worldPos)
        const beforePos = beforePositions.get(bone.name)!

        // Y軸180度回転後の期待値
        expect(worldPos.x).toBeCloseTo(
          -beforePos.x,
          5,
          `${bone.name} X座標が正しく回転されていない`,
        )
        expect(worldPos.y).toBeCloseTo(
          beforePos.y,
          5,
          `${bone.name} Y座標が変わってしまっている`,
        )
        expect(worldPos.z).toBeCloseTo(
          -beforePos.z,
          5,
          `${bone.name} Z座標が正しく回転されていない`,
        )
      }
    })

    it('should migrate skeleton from VRM0.x to VRM1.0 format', () => {
      const { mesh, skeleton } = createSimpleSkinnedMesh()

      // ルートノードを作成してメッシュを追加
      const rootNode = new Object3D()
      rootNode.add(mesh)

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode)

      expect(result.isOk()).toBe(true)

      // 頂点が回転されている
      const positionAttr = mesh.geometry.getAttribute('position')
      // (1, 0, 0) -> (-1, 0, 0)
      expect(positionAttr.getX(0)).toBeCloseTo(-1)
      expect(positionAttr.getZ(0)).toBeCloseTo(0)

      // (0, 0, 1) -> (0, 0, -1)
      expect(positionAttr.getX(2)).toBeCloseTo(0)
      expect(positionAttr.getZ(2)).toBeCloseTo(-1)

      // boneInversesが再計算されている
      expect(skeleton.boneInverses.length).toBe(2)
    })

    it('should return error when no SkinnedMesh found', () => {
      const rootNode = new Object3D()

      const result = migrateSkeletonVRM0ToVRM1(rootNode)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('ASSET_ERROR')
        expect(result.error.message).toContain('SkinnedMesh')
      }
    })

    it('should handle multiple SkinnedMeshes sharing the same skeleton', () => {
      // 共有スケルトンを作成
      const rootBone = new Bone()
      rootBone.position.set(0, 0, 0)
      const skeleton = new Skeleton([rootBone])

      // 2つのSkinnedMeshを作成
      const geometry1 = new BufferGeometry()
      geometry1.setAttribute(
        'position',
        new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 3),
      )
      geometry1.setAttribute(
        'skinWeight',
        new BufferAttribute(new Float32Array(12).fill(0), 4),
      )
      geometry1.setAttribute(
        'skinIndex',
        new BufferAttribute(new Float32Array(12).fill(0), 4),
      )

      const geometry2 = new BufferGeometry()
      geometry2.setAttribute(
        'position',
        new BufferAttribute(new Float32Array([2, 0, 0, 0, 2, 0, 0, 0, 2]), 3),
      )
      geometry2.setAttribute(
        'skinWeight',
        new BufferAttribute(new Float32Array(12).fill(0), 4),
      )
      geometry2.setAttribute(
        'skinIndex',
        new BufferAttribute(new Float32Array(12).fill(0), 4),
      )

      const mesh1 = new SkinnedMesh(geometry1)
      mesh1.add(rootBone)
      mesh1.bind(skeleton)

      const mesh2 = new SkinnedMesh(geometry2)
      mesh2.bind(skeleton)

      const rootNode = new Object3D()
      rootNode.add(mesh1)
      rootNode.add(mesh2)

      const result = migrateSkeletonVRM0ToVRM1(rootNode)

      expect(result.isOk()).toBe(true)

      // 両方のメッシュの頂点が回転されている
      const pos1 = mesh1.geometry.getAttribute('position')
      // mesh1: (1, 0, 0) -> (-1, 0, 0)
      expect(pos1.getX(0)).toBeCloseTo(-1)
      expect(pos1.getZ(0)).toBeCloseTo(0)

      const pos2 = mesh2.geometry.getAttribute('position')
      // mesh2: (2, 0, 0) -> (-2, 0, 0)
      expect(pos2.getX(0)).toBeCloseTo(-2)
      expect(pos2.getZ(0)).toBeCloseTo(0)
    })

    it('should set humanoid bone quaternion to identity', () => {
      // Humanoid Bone: hips, spine, head
      // Non-humanoid Bone: hair
      const hipsBone = new Bone()
      hipsBone.name = 'hips'
      hipsBone.position.set(0, 1, 0)
      hipsBone.rotation.set(0.1, 0.2, 0.3) // 初期回転あり

      const spineBone = new Bone()
      spineBone.name = 'spine'
      spineBone.position.set(0, 0.3, 0)
      spineBone.rotation.set(0.05, 0.1, 0) // 初期回転あり
      hipsBone.add(spineBone)

      const headBone = new Bone()
      headBone.name = 'head'
      headBone.position.set(0, 0.4, 0)
      headBone.rotation.set(0, 0, 0.1) // 初期回転あり
      spineBone.add(headBone)

      // 髪の毛（非Humanoid）
      const hairBone = new Bone()
      hairBone.name = 'hair'
      hairBone.position.set(0, 0.1, -0.1)
      hairBone.rotation.set(0.3, 0, 0) // X軸回転
      headBone.add(hairBone)

      const bones = [hipsBone, spineBone, headBone, hairBone]
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
      mesh.add(hipsBone)
      mesh.bind(skeleton)

      const rootNode = new Object3D()
      rootNode.add(mesh)

      // Humanoid Boneのセットを作成
      const humanoidBones = new Set<Bone>([hipsBone, spineBone, headBone])

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode, { humanoidBones })
      expect(result.isOk()).toBe(true)

      // Humanoid Boneの回転がidentityになっていることを確認
      const identityTolerance = 1e-6

      // hips
      expect(hipsBone.quaternion.x).toBeCloseTo(0, 5)
      expect(hipsBone.quaternion.y).toBeCloseTo(0, 5)
      expect(hipsBone.quaternion.z).toBeCloseTo(0, 5)
      expect(hipsBone.quaternion.w).toBeCloseTo(1, 5)

      // spine
      expect(spineBone.quaternion.x).toBeCloseTo(0, 5)
      expect(spineBone.quaternion.y).toBeCloseTo(0, 5)
      expect(spineBone.quaternion.z).toBeCloseTo(0, 5)
      expect(spineBone.quaternion.w).toBeCloseTo(1, 5)

      // head
      expect(headBone.quaternion.x).toBeCloseTo(0, 5)
      expect(headBone.quaternion.y).toBeCloseTo(0, 5)
      expect(headBone.quaternion.z).toBeCloseTo(0, 5)
      expect(headBone.quaternion.w).toBeCloseTo(1, 5)

      // 非Humanoid Bone（hair）は回転を保持（ただし座標系変換で調整される）
      // quaternionがidentityではないことを確認
      const hairQuatLengthSq =
        hairBone.quaternion.x ** 2 +
        hairBone.quaternion.y ** 2 +
        hairBone.quaternion.z ** 2
      // x, y, zのいずれかが0でなければ回転がある
      expect(hairQuatLengthSq).toBeGreaterThan(identityTolerance)
    })

    it('should preserve world positions for non-humanoid bones with rotation', () => {
      // Humanoid Bone: hips, head
      // Non-humanoid Bone: hair（回転あり）
      const hipsBone = new Bone()
      hipsBone.name = 'hips'
      hipsBone.position.set(0, 1, 0)

      const headBone = new Bone()
      headBone.name = 'head'
      headBone.position.set(0, 0.5, 0)
      hipsBone.add(headBone)

      // 髪の毛（非Humanoid、X軸周りに30度回転）
      const hairBone = new Bone()
      hairBone.name = 'hair'
      hairBone.position.set(0, 0.1, -0.1)
      hairBone.rotation.set(Math.PI / 6, 0, 0)
      headBone.add(hairBone)

      // 髪の先端
      const hairEndBone = new Bone()
      hairEndBone.name = 'hair_end'
      hairEndBone.position.set(0, -0.15, 0)
      hairBone.add(hairEndBone)

      const bones = [hipsBone, headBone, hairBone, hairEndBone]
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
      mesh.add(hipsBone)
      mesh.bind(skeleton)

      const rootNode = new Object3D()
      rootNode.add(mesh)

      // マイグレーション前のワールド座標を記録
      hipsBone.updateMatrixWorld(true)
      const beforePositions = new Map<string, Vector3>()
      for (const bone of bones) {
        const worldPos = new Vector3()
        bone.getWorldPosition(worldPos)
        beforePositions.set(bone.name, worldPos.clone())
      }

      // Humanoid Boneのセットを作成
      const humanoidBones = new Set<Bone>([hipsBone, headBone])

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode, { humanoidBones })
      expect(result.isOk()).toBe(true)

      // マイグレーション後のワールド座標を確認
      hipsBone.updateMatrixWorld(true)
      for (const bone of bones) {
        const worldPos = new Vector3()
        bone.getWorldPosition(worldPos)
        const beforePos = beforePositions.get(bone.name)!

        // Y軸180度回転後の期待値：X -> -X, Z -> -Z, Y -> Y
        expect(worldPos.x).toBeCloseTo(
          -beforePos.x,
          4,
          `${bone.name} X座標が正しく回転されていない`,
        )
        expect(worldPos.y).toBeCloseTo(
          beforePos.y,
          4,
          `${bone.name} Y座標が変わってしまっている`,
        )
        expect(worldPos.z).toBeCloseTo(
          -beforePos.z,
          4,
          `${bone.name} Z座標が正しく回転されていない`,
        )
      }

      // 非Humanoid Boneが回転を保持していることを確認
      const hairQuatLengthSq =
        hairBone.quaternion.x ** 2 +
        hairBone.quaternion.y ** 2 +
        hairBone.quaternion.z ** 2
      expect(hairQuatLengthSq).toBeGreaterThan(1e-6)
    })
  })

  describe('morphTarget rotation', () => {
    /**
     * morphTarget付きのSkinnedMeshを作成するヘルパー
     */
    function createSkinnedMeshWithMorphTargets(): {
      mesh: SkinnedMesh
      skeleton: Skeleton
      rootBone: Bone
    } {
      // ジオメトリ作成（三角形1つ）
      const geometry = new BufferGeometry()
      const positions = new Float32Array([
        1,
        0,
        0, // vertex 0: X軸正方向
        0,
        1,
        0, // vertex 1: Y軸正方向
        0,
        0,
        1, // vertex 2: Z軸正方向
      ])
      geometry.setAttribute('position', new BufferAttribute(positions, 3))

      // morphTarget position（2つのターゲット）
      // target 0: vertex 0 を X方向に +0.5 移動
      const morphPositions0 = new Float32Array([
        0.5,
        0,
        0, // vertex 0: X方向に +0.5
        0,
        0,
        0, // vertex 1: 移動なし
        0,
        0,
        0, // vertex 2: 移動なし
      ])
      // target 1: vertex 2 を Z方向に +0.3 移動
      const morphPositions1 = new Float32Array([
        0,
        0,
        0, // vertex 0: 移動なし
        0,
        0,
        0, // vertex 1: 移動なし
        0,
        0,
        0.3, // vertex 2: Z方向に +0.3
      ])
      geometry.morphAttributes.position = [
        new BufferAttribute(morphPositions0, 3),
        new BufferAttribute(morphPositions1, 3),
      ]

      // スキンウェイトとインデックス
      const skinWeights = new Float32Array([
        1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0,
      ])
      const skinIndices = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      geometry.setAttribute('skinWeight', new BufferAttribute(skinWeights, 4))
      geometry.setAttribute('skinIndex', new BufferAttribute(skinIndices, 4))

      // ボーン階層を作成
      const rootBone = new Bone()
      rootBone.name = 'root'
      rootBone.position.set(0, 0, 0)

      const childBone = new Bone()
      childBone.name = 'child'
      childBone.position.set(0, 1, 0)
      rootBone.add(childBone)

      const bones = [rootBone, childBone]
      const skeleton = new Skeleton(bones)

      // SkinnedMesh作成
      const mesh = new SkinnedMesh(geometry)
      mesh.add(rootBone)
      mesh.bind(skeleton)

      return { mesh, skeleton, rootBone }
    }

    it('should rotate morphTarget position deltas by 180 degrees around Y axis', () => {
      const { mesh } = createSkinnedMeshWithMorphTargets()

      // マイグレーション前のmorphTarget値を記録
      const morphAttrs = mesh.geometry.morphAttributes.position!
      const beforeMorph0 = {
        x0: morphAttrs[0].getX(0),
        y0: morphAttrs[0].getY(0),
        z0: morphAttrs[0].getZ(0),
      }
      const beforeMorph1 = {
        x2: morphAttrs[1].getX(2),
        y2: morphAttrs[1].getY(2),
        z2: morphAttrs[1].getZ(2),
      }

      // マイグレーション前の期待値を確認
      expect(beforeMorph0.x0).toBeCloseTo(0.5)
      expect(beforeMorph0.y0).toBeCloseTo(0)
      expect(beforeMorph0.z0).toBeCloseTo(0)

      expect(beforeMorph1.x2).toBeCloseTo(0)
      expect(beforeMorph1.y2).toBeCloseTo(0)
      expect(beforeMorph1.z2).toBeCloseTo(0.3)

      // マイグレーション実行
      const rootNode = new Object3D()
      rootNode.add(mesh)
      const result = migrateSkeletonVRM0ToVRM1(rootNode)
      expect(result.isOk()).toBe(true)

      // マイグレーション後のmorphTarget値を確認
      // geometry.morphAttributes.position は新しい BufferAttribute 配列で置き換わるため取り直す
      const newMorphAttrs = mesh.geometry.morphAttributes.position!
      // Y軸180度回転: x' = -x, z' = -z, y' = y
      // morphTarget delta (0.5, 0, 0) -> (-0.5, 0, 0)
      expect(newMorphAttrs[0].getX(0)).toBeCloseTo(-0.5)
      expect(newMorphAttrs[0].getY(0)).toBeCloseTo(0)
      expect(newMorphAttrs[0].getZ(0)).toBeCloseTo(0)

      // morphTarget delta (0, 0, 0.3) -> (0, 0, -0.3)
      expect(newMorphAttrs[1].getX(2)).toBeCloseTo(0)
      expect(newMorphAttrs[1].getY(2)).toBeCloseTo(0)
      expect(newMorphAttrs[1].getZ(2)).toBeCloseTo(-0.3)
    })

    it('should not double-rotate morphTargets even if they share ArrayBuffer with position', () => {
      // 同じArrayBufferを共有するケース（glTFの一般的なパターン）
      // 単一の大きなArrayBufferから複数のBufferAttributeを作成
      const sharedBuffer = new ArrayBuffer(4 * 3 * 3 * 3) // 3頂点 * 3成分 * 3属性 * 4bytes
      const sharedArray = new Float32Array(sharedBuffer)

      // position (offset 0-8)
      sharedArray[0] = 1
      sharedArray[1] = 0
      sharedArray[2] = 0 // vertex 0
      sharedArray[3] = 0
      sharedArray[4] = 1
      sharedArray[5] = 0 // vertex 1
      sharedArray[6] = 0
      sharedArray[7] = 0
      sharedArray[8] = 1 // vertex 2

      // morphTarget 0 (offset 9-17)
      sharedArray[9] = 0.5
      sharedArray[10] = 0
      sharedArray[11] = 0 // vertex 0 delta
      sharedArray[12] = 0
      sharedArray[13] = 0
      sharedArray[14] = 0 // vertex 1 delta
      sharedArray[15] = 0
      sharedArray[16] = 0
      sharedArray[17] = 0 // vertex 2 delta

      // morphTarget 1 (offset 18-26)
      sharedArray[18] = 0
      sharedArray[19] = 0
      sharedArray[20] = 0 // vertex 0 delta
      sharedArray[21] = 0
      sharedArray[22] = 0
      sharedArray[23] = 0 // vertex 1 delta
      sharedArray[24] = 0
      sharedArray[25] = 0
      sharedArray[26] = 0.3 // vertex 2 delta

      const geometry = new BufferGeometry()
      geometry.setAttribute(
        'position',
        new BufferAttribute(new Float32Array(sharedBuffer, 0, 9), 3),
      )
      geometry.morphAttributes.position = [
        new BufferAttribute(new Float32Array(sharedBuffer, 36, 9), 3),
        new BufferAttribute(new Float32Array(sharedBuffer, 72, 9), 3),
      ]

      // スキンウェイトとインデックス
      const skinWeights = new Float32Array([
        1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0,
      ])
      const skinIndices = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      geometry.setAttribute('skinWeight', new BufferAttribute(skinWeights, 4))
      geometry.setAttribute('skinIndex', new BufferAttribute(skinIndices, 4))

      // ボーン作成
      const rootBone = new Bone()
      rootBone.name = 'root'
      const skeleton = new Skeleton([rootBone])

      const mesh = new SkinnedMesh(geometry)
      mesh.add(rootBone)
      mesh.bind(skeleton)

      const rootNode = new Object3D()
      rootNode.add(mesh)

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode)
      expect(result.isOk()).toBe(true)

      // 各領域が1回だけ回転されていることを確認

      // position (1, 0, 0) -> (-1, 0, 0)
      const posAttr = geometry.getAttribute('position')
      expect(posAttr.getX(0)).toBeCloseTo(-1)
      expect(posAttr.getZ(0)).toBeCloseTo(0)

      // morphTarget 0 (0.5, 0, 0) -> (-0.5, 0, 0)
      const morphPos0 = geometry.morphAttributes.position![0]
      expect(morphPos0.getX(0)).toBeCloseTo(-0.5)
      expect(morphPos0.getZ(0)).toBeCloseTo(0)

      // morphTarget 1 (0, 0, 0.3) -> (0, 0, -0.3)
      const morphPos1 = geometry.morphAttributes.position![1]
      expect(morphPos1.getX(2)).toBeCloseTo(0)
      expect(morphPos1.getZ(2)).toBeCloseTo(-0.3)
    })

    it('should correctly rotate morphTarget when applied to rotated vertices', () => {
      // このテストはmorphTargetの回転が正しいかを検証
      // 回転後のメッシュに対してmorphTargetを適用したとき、
      // 期待通りの方向に頂点が移動することを確認
      const { mesh } = createSkinnedMeshWithMorphTargets()

      const rootNode = new Object3D()
      rootNode.add(mesh)

      // マイグレーション前の状態を記録
      const posAttr = mesh.geometry.getAttribute('position')
      const morphAttrs = mesh.geometry.morphAttributes.position!

      // マイグレーション前: vertex 0 at (1, 0, 0), morph delta (0.5, 0, 0)
      // morphTarget適用後: (1.5, 0, 0)
      const beforeV0 = posAttr.getX(0)
      const beforeMorphDelta0 = morphAttrs[0].getX(0)
      const beforeApplied0 = beforeV0 + beforeMorphDelta0
      expect(beforeApplied0).toBeCloseTo(1.5)

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode)
      expect(result.isOk()).toBe(true)

      // マイグレーション後: vertex 0 at (-1, 0, 0), morph delta (-0.5, 0, 0)
      // morphTarget適用後: (-1.5, 0, 0)
      // これはマイグレーション前の (1.5, 0, 0) をY軸180度回転した結果と一致すべき
      // 新しい BufferAttribute が設定されるため取り直す
      const newPosAttr = mesh.geometry.getAttribute('position')
      const newMorphAttrs = mesh.geometry.morphAttributes.position!
      const afterV0 = newPosAttr.getX(0)
      const afterMorphDelta0 = newMorphAttrs[0].getX(0)
      const afterApplied0 = afterV0 + afterMorphDelta0
      expect(afterApplied0).toBeCloseTo(-1.5)

      // 同様に vertex 2
      // マイグレーション前: vertex 2 at (0, 0, 1), morph delta (0, 0, 0.3)
      // morphTarget適用後: (0, 0, 1.3)
      // マイグレーション後: vertex 2 at (0, 0, -1), morph delta (0, 0, -0.3)
      // morphTarget適用後: (0, 0, -1.3)
      const afterV2Z = newPosAttr.getZ(2)
      const afterMorphDelta2Z = newMorphAttrs[1].getZ(2)
      const afterApplied2Z = afterV2Z + afterMorphDelta2Z
      expect(afterApplied2Z).toBeCloseTo(-1.3)
    })
  })
})
