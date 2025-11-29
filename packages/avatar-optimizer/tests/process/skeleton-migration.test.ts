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
  rebuildBoneTransformsPositionOnly,
  recordBoneWorldPositions,
  rotateBonePositions,
  rotateVertexPositionsAroundYAxis,
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
    1, 0, 0, // vertex 0: X軸正方向
    0, 1, 0, // vertex 1: Y軸正方向
    0, 0, 1, // vertex 2: Z軸正方向
  ])
  geometry.setAttribute('position', new BufferAttribute(positions, 3))

  // スキンウェイトとインデックス
  const skinWeights = new Float32Array([
    1.0, 0.0, 0.0, 0.0,
    1.0, 0.0, 0.0, 0.0,
    1.0, 0.0, 0.0, 0.0,
  ])
  const skinIndices = new Float32Array([
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ])
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
  describe('rotateVertexPositionsAroundYAxis', () => {
    it('should rotate vertex positions by 180 degrees around Y axis', () => {
      const { mesh } = createSimpleSkinnedMesh()
      const positionAttr = mesh.geometry.getAttribute('position')

      // Y軸180度回転を実行
      rotateVertexPositionsAroundYAxis(mesh)

      // 回転後の座標を確認
      // (1, 0, 0) -> (-1, 0, 0)
      expect(positionAttr.getX(0)).toBeCloseTo(-1)
      expect(positionAttr.getY(0)).toBeCloseTo(0)
      expect(positionAttr.getZ(0)).toBeCloseTo(0)

      // (0, 1, 0) -> (0, 1, 0) (Y軸上なので変わらない)
      expect(positionAttr.getX(1)).toBeCloseTo(0)
      expect(positionAttr.getY(1)).toBeCloseTo(1)
      expect(positionAttr.getZ(1)).toBeCloseTo(0)

      // (0, 0, 1) -> (0, 0, -1)
      expect(positionAttr.getX(2)).toBeCloseTo(0)
      expect(positionAttr.getY(2)).toBeCloseTo(0)
      expect(positionAttr.getZ(2)).toBeCloseTo(-1)
    })
  })

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

  describe('rebuildBoneTransformsPositionOnly', () => {
    it('should rebuild bone positions while preserving rotation', () => {
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

      // 回転前の回転値を記録
      const rootRotationBefore = rootBone.rotation.clone()
      const childRotationBefore = childBone.rotation.clone()

      // 新しい位置を設定（Y軸180度回転後）
      const rotatedPositions = new Map<Bone, Vector3>()
      rotatedPositions.set(rootBone, new Vector3(-1, 0, 0))
      rotatedPositions.set(childBone, new Vector3(-1, 1, 0))

      // 再構築
      rebuildBoneTransformsPositionOnly(rootBone, rotatedPositions)

      // 位置が更新されている
      expect(rootBone.position.x).toBeCloseTo(-1)
      expect(rootBone.position.y).toBeCloseTo(0)
      expect(rootBone.position.z).toBeCloseTo(0)

      // 回転は維持されている
      expect(rootBone.rotation.x).toBeCloseTo(rootRotationBefore.x)
      expect(rootBone.rotation.y).toBeCloseTo(rootRotationBefore.y)
      expect(rootBone.rotation.z).toBeCloseTo(rootRotationBefore.z)

      expect(childBone.rotation.x).toBeCloseTo(childRotationBefore.x)
      expect(childBone.rotation.y).toBeCloseTo(childRotationBefore.y)
      expect(childBone.rotation.z).toBeCloseTo(childRotationBefore.z)
    })
  })

  describe('migrateSkeletonVRM0ToVRM1', () => {
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
  })
})
