import { err, ok, Result, safeTry } from 'neverthrow'
import {
  Bone,
  BufferAttribute,
  Matrix4,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three'
import { OptimizationError } from '../../types'

/**
 * マイグレーションのデバッグオプション
 */
export interface MigrationDebugOptions {
  /** 頂点回転をスキップ */
  skipVertexRotation?: boolean
  /** ボーン位置回転をスキップ */
  skipBoneTransform?: boolean
  /** bindMatrix更新をスキップ */
  skipBindMatrix?: boolean
}

/**
 * VRM0.x形式のスケルトンをVRM1.0形式に変換
 * Y軸周り180度回転を適用してモデルの向きを+Z前向きに変更
 *
 * 処理内容:
 * 1. 全メッシュの頂点位置をY軸180度回転
 * 2. 各ボーンのワールド座標を記録し、Y軸180度回転
 * 3. ルートからツリーを下りながらローカル位置を再計算（rotationは維持）
 * 4. InverseBoneMatrix（boneInverses）を再計算
 *
 * @param rootNode - VRMモデルのルートノード（VRM.scene）
 * @param debug - デバッグオプション
 * @returns 変換結果
 */
export function migrateSkeletonVRM0ToVRM1(
  rootNode: Object3D,
  debug: MigrationDebugOptions = {},
): Result<void, OptimizationError> {
  return safeTry(function* () {
    // 1. 全SkinnedMeshを収集
    const skinnedMeshes: SkinnedMesh[] = []
    const otherMeshes: { name: string; type: string }[] = []
    rootNode.traverse((obj) => {
      if (obj instanceof SkinnedMesh) {
        skinnedMeshes.push(obj)
      } else if ('isMesh' in obj && obj.isMesh) {
        otherMeshes.push({ name: obj.name, type: obj.type })
      }
    })

    // デバッグ: メッシュ情報を出力
    console.log('[Migration] SkinnedMeshes:', skinnedMeshes.map((m) => m.name))
    console.log('[Migration] Other Meshes (not SkinnedMesh):', otherMeshes)

    if (skinnedMeshes.length === 0) {
      return err({
        type: 'ASSET_ERROR',
        message: 'SkinnedMeshが見つかりません',
      })
    }

    // 2. 各メッシュの頂点位置をY軸180度回転
    if (!debug.skipVertexRotation) {
      for (const mesh of skinnedMeshes) {
        rotateVertexPositionsAroundYAxis(mesh)
      }
    }

    // 3. スケルトンを収集（重複排除）
    if (!debug.skipBoneTransform) {
      const processedSkeletons = new Set<Skeleton>()

      for (const mesh of skinnedMeshes) {
        const skeleton = mesh.skeleton
        if (!skeleton || processedSkeletons.has(skeleton)) continue
        processedSkeletons.add(skeleton)

        // 4. ボーンワールド座標を記録
        const originalPositions = recordBoneWorldPositions(skeleton)

        // 5. 座標をY軸180度回転
        const rotatedPositions = rotateBonePositions(originalPositions)

        // 6. ルートボーンを特定
        const rootBone = findRootBone(skeleton)
        if (!rootBone) {
          return err({
            type: 'ASSET_ERROR',
            message: 'ルートボーンが見つかりません',
          })
        }

        // 7. ボーン変換を再構築（位置のみ、rotationは維持）
        rebuildBoneTransformsPositionOnly(rootBone, rotatedPositions)

        // 8. InverseBoneMatrixを再計算
        recalculateBoneInverses(skeleton)
      }
    }

    // 9. bindMatrixの更新
    if (!debug.skipBindMatrix) {
      for (const mesh of skinnedMeshes) {
        mesh.skeleton.calculateInverses()
      }
    }

    return ok(undefined)
  })
}

/**
 * SkinnedMeshの頂点位置をY軸周り180度回転
 * position属性のみ変換（normalは維持）
 */
export function rotateVertexPositionsAroundYAxis(mesh: SkinnedMesh): void {
  const geometry = mesh.geometry
  const positionAttr = geometry.getAttribute('position')

  if (!positionAttr || !(positionAttr instanceof BufferAttribute)) {
    return
  }

  const rotationMatrix = new Matrix4().makeRotationY(Math.PI)
  const vertex = new Vector3()

  for (let i = 0; i < positionAttr.count; i++) {
    vertex.set(positionAttr.getX(i), positionAttr.getY(i), positionAttr.getZ(i))
    vertex.applyMatrix4(rotationMatrix)
    positionAttr.setXYZ(i, vertex.x, vertex.y, vertex.z)
  }

  positionAttr.needsUpdate = true
}

/**
 * スケルトン内の全ボーンのワールド座標を記録
 */
export function recordBoneWorldPositions(
  skeleton: Skeleton,
): Map<Bone, Vector3> {
  const positions = new Map<Bone, Vector3>()

  // ワールド行列を更新
  if (skeleton.bones.length > 0) {
    skeleton.bones[0].updateWorldMatrix(true, true)
  }

  for (const bone of skeleton.bones) {
    const worldPos = new Vector3()
    bone.getWorldPosition(worldPos)
    positions.set(bone, worldPos.clone())
  }

  return positions
}

/**
 * ボーン座標をY軸周り180度回転
 */
export function rotateBonePositions(
  positions: Map<Bone, Vector3>,
): Map<Bone, Vector3> {
  const rotated = new Map<Bone, Vector3>()
  const rotationMatrix = new Matrix4().makeRotationY(Math.PI)

  for (const [bone, pos] of positions) {
    const newPos = pos.clone().applyMatrix4(rotationMatrix)
    rotated.set(bone, newPos)
  }

  return rotated
}

/**
 * スケルトンのルートボーンを特定
 * 親がBoneでないボーンをルートとして返す
 */
export function findRootBone(skeleton: Skeleton): Bone | null {
  for (const bone of skeleton.bones) {
    // 親がBoneでない場合、このボーンがルート
    if (!(bone.parent instanceof Bone)) {
      return bone
    }
  }
  return skeleton.bones[0] || null
}

/**
 * ルートからツリーを下りながらボーンのローカル位置を再計算
 * rotation（向き）は元のまま維持
 */
export function rebuildBoneTransformsPositionOnly(
  rootBone: Bone,
  rotatedPositions: Map<Bone, Vector3>,
): void {
  function processBone(bone: Bone, parentWorldMatrix: Matrix4): void {
    const targetWorldPos = rotatedPositions.get(bone)
    if (!targetWorldPos) return

    // 親のワールド逆行列を計算
    const parentWorldInverse = parentWorldMatrix.clone().invert()

    // ターゲットのローカル位置を計算
    // localPos = parentWorldInverse * worldPos
    const localPos = targetWorldPos.clone().applyMatrix4(parentWorldInverse)

    // ボーンのローカル位置を更新（rotationは変更しない）
    bone.position.copy(localPos)

    // 現在のワールド行列を更新
    bone.updateMatrix()
    const currentWorldMatrix = parentWorldMatrix.clone().multiply(bone.matrix)

    // 子ボーンを再帰処理
    for (const child of bone.children) {
      if (child instanceof Bone) {
        processBone(child, currentWorldMatrix)
      }
    }
  }

  // ルートボーンから開始（親のワールド行列は単位行列または親オブジェクトの行列）
  const parentMatrix = rootBone.parent
    ? rootBone.parent.matrixWorld.clone()
    : new Matrix4()

  processBone(rootBone, parentMatrix)
}

/**
 * InverseBoneMatrix（skeleton.boneInverses）を再計算
 */
export function recalculateBoneInverses(skeleton: Skeleton): void {
  // ワールド行列を更新
  skeleton.bones.forEach((bone) => bone.updateMatrixWorld(true))

  // calculateInversesを呼び出し
  // これは各bone.matrixWorldの逆行列をboneInversesに設定する
  skeleton.calculateInverses()

  // 行列テクスチャを更新（使用している場合）
  skeleton.computeBoneTexture()
}
