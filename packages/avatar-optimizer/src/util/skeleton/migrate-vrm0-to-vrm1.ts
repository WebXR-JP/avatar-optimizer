import { err, ok, Result, safeTry } from 'neverthrow'
import {
  Bone,
  BufferAttribute,
  Matrix4,
  Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three'
import { OptimizationError } from '../../types'

/**
 * マイグレーションオプション
 */
export interface MigrationOptions {
  /** Humanoid Boneのセット（これらのボーンのみ回転をidentityにする） */
  humanoidBones?: Set<Bone>
  /** 頂点回転をスキップ（デバッグ用） */
  skipVertexRotation?: boolean
  /** ボーン位置回転をスキップ（デバッグ用） */
  skipBoneTransform?: boolean
  /** bindMatrix更新をスキップ（デバッグ用） */
  skipBindMatrix?: boolean
}

/**
 * VRM0.x形式のスケルトンをVRM1.0形式に変換
 * Y軸周り180度回転を適用してモデルの向きを+Z前向きに変更
 *
 * 処理内容:
 * 1. 全メッシュの頂点位置をY軸180度回転
 * 2. 各ボーンのワールド座標を記録し、Y軸180度回転
 * 3. Humanoid Boneのrotationをidentityにリセット（VRM1.0仕様）
 *    - 非Humanoid Bone（髪、服など）は相対的な回転を保持
 * 4. ルートからツリーを下りながらローカル位置を再計算
 * 5. InverseBoneMatrix（boneInverses）を再計算
 *
 * @param rootNode - VRMモデルのルートノード（VRM.scene）
 * @param options - マイグレーションオプション
 * @returns 変換結果
 */
export function migrateSkeletonVRM0ToVRM1(
  rootNode: Object3D,
  options: MigrationOptions = {},
): Result<void, OptimizationError> {
  return safeTry(function* () {
    // 1. 全SkinnedMeshを収集
    const skinnedMeshes: SkinnedMesh[] = []
    rootNode.traverse((obj) => {
      if (obj instanceof SkinnedMesh) {
        skinnedMeshes.push(obj)
      }
    })

    if (skinnedMeshes.length === 0) {
      return err({
        type: 'ASSET_ERROR',
        message: 'SkinnedMeshが見つかりません',
      })
    }

    // 2. 各メッシュの頂点位置をY軸180度回転
    // 同じ BufferAttribute を共有するメッシュが複数回処理されないようにするため、
    // 処理済み position 属性を追跡
    // 注意: VRMでは geometry は異なるが position 属性は共有されることがある
    if (!options.skipVertexRotation) {
      const processedPositionAttrs = new Set<BufferAttribute>()
      for (const mesh of skinnedMeshes) {
        const positionAttr = mesh.geometry.getAttribute('position')
        if (!(positionAttr instanceof BufferAttribute)) continue
        if (processedPositionAttrs.has(positionAttr)) continue
        processedPositionAttrs.add(positionAttr)
        rotateVertexPositionsAroundYAxis(mesh)
      }
    }

    // 3. 全ボーンのワールド座標を記録（重複排除）
    // 複数のスケルトンが同じボーンを共有している場合があるため、
    // 先にすべてのボーンの座標を記録してから変換を適用する
    if (!options.skipBoneTransform) {
      const allBonePositions = new Map<Bone, Vector3>()
      const processedSkeletons = new Set<Skeleton>()

      // 4. すべてのスケルトンからボーン座標を収集
      for (const mesh of skinnedMeshes) {
        const skeleton = mesh.skeleton
        if (!skeleton || processedSkeletons.has(skeleton)) continue
        processedSkeletons.add(skeleton)

        const positions = recordBoneWorldPositions(skeleton)
        for (const [bone, pos] of positions) {
          if (!allBonePositions.has(bone)) {
            allBonePositions.set(bone, pos)
          }
        }
      }

      // 5. 座標をY軸180度回転
      const rotatedPositions = rotateBonePositions(allBonePositions)

      // 6. 全ボーンから真のルートボーン（親がBoneでないもの）を特定
      // VRMでは各SkinnedMesh.skeleton.bonesは使用するボーンのみを含むが、
      // 実際のボーン階層は1つなので、全ボーンを走査して真のルートを見つける
      const allRootBones = new Set<Bone>()
      for (const bone of allBonePositions.keys()) {
        // 親を辿って真のルートを見つける
        let current: Bone = bone
        while (current.parent instanceof Bone) {
          current = current.parent
        }
        allRootBones.add(current)
      }

      if (allRootBones.size === 0) {
        return err({
          type: 'ASSET_ERROR',
          message: 'ルートボーンが見つかりません',
        })
      }

      // 7. 各ルートボーンからボーン変換を再構築
      for (const rootBone of allRootBones) {
        rebuildBoneTransforms(rootBone, rotatedPositions, options.humanoidBones)
      }

      // 8. すべてのスケルトンのInverseBoneMatrixを再計算
      processedSkeletons.forEach((skeleton) => {
        recalculateBoneInverses(skeleton)
      })
    }

    // 9. bindMatrixの更新
    if (!options.skipBindMatrix) {
      for (const mesh of skinnedMeshes) {
        mesh.skeleton.calculateInverses()
      }
    }

    return ok(undefined)
  })
}

/**
 * SkinnedMeshの頂点位置と法線をY軸周り180度回転
 * position, normal属性とmorphTarget(position, normal)を変換
 */
export function rotateVertexPositionsAroundYAxis(mesh: SkinnedMesh): void {
  const geometry = mesh.geometry
  const positionAttr = geometry.getAttribute('position')

  if (!positionAttr || !(positionAttr instanceof BufferAttribute)) {
    return
  }

  const rotationMatrix = new Matrix4().makeRotationY(Math.PI)
  const vec = new Vector3()

  // 頂点位置を回転
  for (let i = 0; i < positionAttr.count; i++) {
    vec.set(positionAttr.getX(i), positionAttr.getY(i), positionAttr.getZ(i))
    vec.applyMatrix4(rotationMatrix)
    positionAttr.setXYZ(i, vec.x, vec.y, vec.z)
  }
  positionAttr.needsUpdate = true

  // 法線も回転（アウトライン押し出し方向に影響）
  const normalAttr = geometry.getAttribute('normal')
  if (normalAttr && normalAttr instanceof BufferAttribute) {
    for (let i = 0; i < normalAttr.count; i++) {
      vec.set(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i))
      vec.applyMatrix4(rotationMatrix)
      normalAttr.setXYZ(i, vec.x, vec.y, vec.z)
    }
    normalAttr.needsUpdate = true
  }

  // morphTargetのposition属性も回転
  // morphAttributesはキー(position, normalなど)ごとにBufferAttribute配列を持つ
  const morphPositions = geometry.morphAttributes.position
  if (morphPositions && Array.isArray(morphPositions)) {
    for (const morphAttr of morphPositions) {
      if (!(morphAttr instanceof BufferAttribute)) continue

      for (let i = 0; i < morphAttr.count; i++) {
        // morphTargetはデルタ（差分ベクトル）なので、同様にY軸180度回転
        vec.set(morphAttr.getX(i), morphAttr.getY(i), morphAttr.getZ(i))
        vec.applyMatrix4(rotationMatrix)
        morphAttr.setXYZ(i, vec.x, vec.y, vec.z)
      }
      morphAttr.needsUpdate = true
    }
  }

  // morphTargetのnormal属性も回転
  const morphNormals = geometry.morphAttributes.normal
  if (morphNormals && Array.isArray(morphNormals)) {
    for (const morphAttr of morphNormals) {
      if (!(morphAttr instanceof BufferAttribute)) continue

      for (let i = 0; i < morphAttr.count; i++) {
        vec.set(morphAttr.getX(i), morphAttr.getY(i), morphAttr.getZ(i))
        vec.applyMatrix4(rotationMatrix)
        morphAttr.setXYZ(i, vec.x, vec.y, vec.z)
      }
      morphAttr.needsUpdate = true
    }
  }
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
 * ルートからツリーを下りながらボーンのローカル変換を再計算
 *
 * VRM1.0仕様では Humanoid Bone のみ rotation が identity である必要がある。
 * 非Humanoid Bone（髪、服、SpringBone制御のボーンなど）は相対的な回転を保持する。
 *
 * @param rootBone - ルートボーン
 * @param rotatedPositions - Y軸180度回転後のワールド座標
 * @param humanoidBones - Humanoid Boneのセット（これらのみidentityにする）
 */
export function rebuildBoneTransforms(
  rootBone: Bone,
  rotatedPositions: Map<Bone, Vector3>,
  humanoidBones?: Set<Bone>,
): void {
  const identityQuat = new Quaternion()
  const rotationMatrix = new Matrix4().makeRotationY(Math.PI)
  const rotationQuat = new Quaternion().setFromRotationMatrix(rotationMatrix)

  /**
   * ボーンを処理する再帰関数
   * @param bone - 処理対象のボーン
   * @param parentWorldMatrix - 親のワールド行列
   */
  function processBone(bone: Bone, parentWorldMatrix: Matrix4): void {
    let targetWorldPos = rotatedPositions.get(bone)

    // rotatedPositionsに含まれないボーン（SpringBone専用ボーンなど）は
    // 現在のワールド位置を取得してY軸180度回転
    if (!targetWorldPos) {
      bone.updateMatrixWorld(true)
      const currentWorldPos = new Vector3()
      bone.getWorldPosition(currentWorldPos)
      targetWorldPos = currentWorldPos.applyMatrix4(rotationMatrix)
    }

    // 親のワールド行列の逆行列を計算
    const parentWorldMatrixInverse = parentWorldMatrix.clone().invert()

    // Humanoid Boneかどうかで処理を分岐
    const isHumanoidBone = humanoidBones?.has(bone) ?? true

    if (isHumanoidBone) {
      // Humanoid Bone: VRM1.0仕様に従い rotation を identity にする
      bone.quaternion.copy(identityQuat)

      // ローカル位置 = ワールド位置を親のローカル座標系に変換
      // 親の rotation が identity なので、単純な差分で計算できる
      const parentWorldPos = new Vector3().setFromMatrixPosition(
        parentWorldMatrix,
      )
      const localPos = targetWorldPos.clone().sub(parentWorldPos)
      bone.position.copy(localPos)
    } else {
      // 非Humanoid Bone: 相対的な回転を保持
      // マイグレーション前の rotation を Y軸180度回転で調整
      // VRM0のローカル座標系はY軸180度回転しているため、
      // rotation も同様に調整する必要がある

      // 現在の回転を取得（マイグレーション前のVRM0での回転）
      const originalLocalQuat = bone.quaternion.clone()

      // VRM0→VRM1でローカル座標系がY軸180度回転するため、
      // 元の回転を新しい座標系に変換: q' = R * q * R^-1
      // ここで R は Y軸180度回転
      const newLocalQuat = rotationQuat
        .clone()
        .multiply(originalLocalQuat)
        .multiply(rotationQuat.clone().invert())
      bone.quaternion.copy(newLocalQuat)

      // ローカル位置を計算
      // ワールド位置から親のワールド行列の逆行列を適用してローカル位置を求める
      const localPos = targetWorldPos
        .clone()
        .applyMatrix4(parentWorldMatrixInverse)
      bone.position.copy(localPos)
    }

    // 行列を更新
    bone.updateMatrix()
    bone.updateMatrixWorld(true)

    // 子ボーンを再帰処理（更新後のワールド行列を渡す）
    for (const child of bone.children) {
      if (child instanceof Bone) {
        processBone(child, bone.matrixWorld)
      }
    }
  }

  // ルートボーンから開始
  // 親のワールド行列を取得（親がない場合は単位行列）
  let parentWorldMatrix = new Matrix4()
  if (rootBone.parent) {
    rootBone.parent.updateMatrixWorld(true)
    parentWorldMatrix = rootBone.parent.matrixWorld.clone()
  }

  processBone(rootBone, parentWorldMatrix)
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
