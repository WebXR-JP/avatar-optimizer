import type { VRM } from '@pixiv/three-vrm'
import { Bone, Matrix4, Vector3 } from 'three'

/**
 * VRM0マイグレーション前にSpringBoneの末端ボーン方向を記録
 * VRM0ではボーンの回転がボーンの向きを表すため、マイグレーションで回転が
 * identityになる前にこの情報を保存する必要がある
 *
 * @param vrm - VRMオブジェクト
 * @returns ボーンごとのローカル方向ベクトル（正規化済み）
 */
export function recordSpringBoneDirections(vrm: VRM): Map<Bone, Vector3> {
  const directions = new Map<Bone, Vector3>()

  if (!vrm.springBoneManager) return directions

  const springBoneManager = vrm.springBoneManager
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joints = (springBoneManager as any).joints
  if (!joints || joints.size === 0) return directions

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  joints.forEach((joint: any) => {
    const bone = joint.bone as Bone | undefined
    if (!bone) return

    // joint.childがなく、bone.childrenにBoneがない場合は末端
    const hasJointChild = joint.child != null
    const hasBoneChild = bone.children.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (child: any) => child.type === 'Bone' || child.isBone,
    )

    if (!hasJointChild && !hasBoneChild) {
      // bone.positionはこのボーンの親からの相対位置
      // VRM0ではこれがボーンの「向き」を表す
      // マイグレーション後もこの方向を維持するために記録
      const direction = new Vector3().copy(bone.position)
      if (direction.lengthSq() > 0) {
        direction.normalize()
      } else {
        // positionがゼロの場合はY軸方向
        direction.set(0, 1, 0)
      }
      directions.set(bone, direction)
    }
  })

  return directions
}

/**
 * SpringBone末端ジョイントに仮想tailノードを作成
 * VRM1.0仕様ではjointsの最後にtailノードが必要
 * 事前に記録したボーン方向を使用して正しい向きに仮想ノードを追加
 *
 * @param vrm - VRMオブジェクト
 * @param preRecordedDirections - recordSpringBoneDirectionsで記録した方向
 * @returns 作成された仮想tailノードの配列（クリーンアップ用）
 */
export function createVirtualTailNodes(
  vrm: VRM,
  preRecordedDirections?: Map<Bone, Vector3>,
): Bone[] {
  const createdTailNodes: Bone[] = []

  if (!vrm.springBoneManager) return createdTailNodes

  const springBoneManager = vrm.springBoneManager
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joints = (springBoneManager as any).joints
  if (!joints || joints.size === 0) return createdTailNodes

  // 末端ジョイント（childを持たないジョイント）を見つけて仮想tailを作成
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  joints.forEach((joint: any) => {
    const bone = joint.bone as Bone | undefined
    if (!bone) return

    // joint.childがなく、bone.childrenにBoneがない場合は末端
    const hasJointChild = joint.child != null

    const hasBoneChild = bone.children.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (child: any) => child.type === 'Bone' || child.isBone,
    )

    if (!hasJointChild && !hasBoneChild) {
      // 仮想tailノードを作成
      const tailBone = new Bone()
      tailBone.name = `${bone.name}_tail`

      // 事前記録された方向を使用（VRM0マイグレーションの場合）
      // なければ現在のbone.positionから計算
      let direction: Vector3
      if (preRecordedDirections?.has(bone)) {
        direction = preRecordedDirections
          .get(bone)!
          .clone()
          .multiplyScalar(0.07)
      } else {
        // three-vrmと同様のロジック: bone.positionを正規化して0.07を掛ける
        direction = new Vector3().copy(bone.position)
        if (direction.lengthSq() > 0) {
          direction.normalize().multiplyScalar(0.07)
        } else {
          // positionがゼロの場合はY軸方向に7cm
          direction.set(0, 0.07, 0)
        }
      }
      tailBone.position.copy(direction)

      // 親ボーンに追加
      bone.add(tailBone)
      tailBone.updateMatrixWorld(true)

      createdTailNodes.push(tailBone)
    }
  })

  return createdTailNodes
}

/**
 * 作成した仮想tailノードをクリーンアップ
 *
 * @param tailNodes - createVirtualTailNodesで作成されたノードの配列
 */
export function cleanupVirtualTailNodes(tailNodes: Bone[]): void {
  for (const tailNode of tailNodes) {
    if (tailNode.parent) {
      tailNode.parent.remove(tailNode)
    }
  }
}

/**
 * SpringBoneの重力方向（gravityDir）をY軸180度回転
 * VRM0→VRM1マイグレーション時に必要
 *
 * gravityDirはワールド座標系で指定されるため、
 * モデルの向きがY軸180度回転した場合は重力方向も同様に回転する必要がある
 *
 * @param vrm - VRMオブジェクト
 */
export function rotateSpringBoneGravityDirections(vrm: VRM): void {
  if (!vrm.springBoneManager) {
    return
  }

  const springBoneManager = vrm.springBoneManager
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joints = (springBoneManager as any).joints
  if (!joints || joints.size === 0) {
    return
  }

  const rotationMatrix = new Matrix4().makeRotationY(Math.PI)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  joints.forEach((joint: any) => {
    const settings = joint.settings
    if (!settings || !settings.gravityDir) return

    // gravityDirをY軸180度回転（X, Zを反転）
    const gravityDir = settings.gravityDir as Vector3
    gravityDir.applyMatrix4(rotationMatrix)
  })
}

/**
 * SpringBoneジョイントの状態（_currentTailと_boneAxis）を記録
 * VRM0→VRM1マイグレーション前に呼び出す
 *
 * @param vrm - VRMオブジェクト
 * @returns ジョイントごとの状態（_currentTailワールド座標と_boneAxis方向）
 */
export function recordSpringBoneState(
  vrm: VRM,
): Map<Bone, { currentTail: Vector3; boneAxis: Vector3 }> {
  const states = new Map<Bone, { currentTail: Vector3; boneAxis: Vector3 }>()

  if (!vrm.springBoneManager) return states

  const springBoneManager = vrm.springBoneManager
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joints = (springBoneManager as any).joints
  if (!joints || joints.size === 0) return states

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  joints.forEach((joint: any) => {
    const bone = joint.bone as Bone | undefined
    const currentTail = joint._currentTail as Vector3 | undefined
    const boneAxis = joint._boneAxis as Vector3 | undefined
    if (bone && currentTail && boneAxis) {
      states.set(bone, {
        currentTail: currentTail.clone(),
        boneAxis: boneAxis.clone(),
      })
    }
  })

  return states
}

/**
 * @deprecated recordSpringBoneStateを使用してください
 */
export function recordSpringBoneCurrentTails(vrm: VRM): Map<Bone, Vector3> {
  const tails = new Map<Bone, Vector3>()
  const states = recordSpringBoneState(vrm)
  states.forEach((state, bone) => {
    tails.set(bone, state.currentTail)
  })
  return tails
}

/**
 * SpringBoneの状態を復元
 * VRM0→VRM1マイグレーション後、setInitState() + reset()の後に呼び出す
 *
 * マイグレーションでボーンのローカル座標系がY軸180度回転するため、
 * SpringBoneの内部状態も調整が必要。
 *
 * reset()は_initialLocalChildPositionから_boneAxisを再計算するため、
 * この関数はreset()の後に呼び出す必要がある。
 *
 * @param vrm - VRMオブジェクト
 * @param preRecordedState - recordSpringBoneStateで記録した状態
 */
export function restoreSpringBoneState(
  vrm: VRM,
  preRecordedState: Map<Bone, { currentTail: Vector3; boneAxis: Vector3 }>,
): void {
  if (!vrm.springBoneManager) {
    return
  }

  const springBoneManager = vrm.springBoneManager
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joints = (springBoneManager as any).joints
  if (!joints || joints.size === 0) {
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  joints.forEach((joint: any) => {
    const bone = joint.bone as Bone | undefined
    if (!bone || !preRecordedState.has(bone)) return

    const state = preRecordedState.get(bone)!

    // _boneAxisを元の値に復元
    const boneAxis = joint._boneAxis as Vector3 | undefined
    if (boneAxis) {
      boneAxis.copy(state.boneAxis)
    }

    // _currentTailと_prevTailを調整
    // マイグレーション後、bone.matrixWorldの位置成分がY軸180度回転しているため、
    // _currentTailもボーンの新しい位置からの相対位置として再計算する必要がある
    const currentTail = joint._currentTail as Vector3 | undefined
    const prevTail = joint._prevTail as Vector3 | undefined

    if (currentTail) {
      // reset()で計算された_currentTailを使用（bone.localToWorld(_initialLocalChildPosition)）
      // これはマイグレーション後のボーン位置に対して正しい相対位置になっている
      // _boneAxisだけを復元すれば、stiffnessによる復元力の方向は正しくなる

      // 注意: state.currentTailはマイグレーション前のワールド座標
      // マイグレーション後はボーンのワールド位置が変わっているため、
      // そのまま復元すると不整合が起きる
      // reset()で計算された値をそのまま使用する

      // _prevTailは_currentTailと同じに設定（初期状態では慣性がない）
      if (prevTail) {
        prevTail.copy(currentTail)
      }
    }
  })
}

/**
 * SpringBoneの内部軸（_boneAxis）をY軸180度回転
 * VRM0→VRM1マイグレーション後にsetInitState()を呼んだ後に必要
 *
 * @deprecated restoreSpringBoneStateを使用してください
 *
 * @param vrm - VRMオブジェクト
 * @param preRecordedTails - recordSpringBoneCurrentTailsで記録したワールド座標（オプション）
 */
export function rotateSpringBoneBoneAxis(
  vrm: VRM,
  preRecordedTails?: Map<Bone, Vector3>,
): void {
  if (!vrm.springBoneManager) {
    return
  }

  const springBoneManager = vrm.springBoneManager
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joints = (springBoneManager as any).joints
  if (!joints || joints.size === 0) {
    return
  }

  const rotationMatrix = new Matrix4().makeRotationY(Math.PI)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  joints.forEach((joint: any) => {
    const bone = joint.bone as Bone | undefined
    if (!bone) return

    // _boneAxisをY軸180度回転（X, Zを反転して元に戻す）
    // これによりworldSpaceBoneAxisがマイグレーション前と同じ方向を維持する
    const boneAxis = joint._boneAxis as Vector3 | undefined
    if (boneAxis) {
      boneAxis.applyMatrix4(rotationMatrix)
    }

    // _initialLocalChildPositionを再計算
    // 記録されたワールド座標（_currentTail）から、新しいbone.matrixWorldに対応した
    // ローカル座標を逆算する
    const initialLocalChildPosition = joint._initialLocalChildPosition as
      | Vector3
      | undefined
    if (initialLocalChildPosition && preRecordedTails?.has(bone)) {
      const targetWorldPos = preRecordedTails.get(bone)!
      // ワールド座標からローカル座標に逆変換
      // bone.worldToLocal()は引数を変更するのでcloneを渡す
      const newLocalPos = bone.worldToLocal(targetWorldPos.clone())
      initialLocalChildPosition.copy(newLocalPos)
    }
  })
}

/**
 * SpringBoneコライダーのオフセットをY軸180度回転
 * VRM0→VRM1マイグレーション時に必要
 *
 * コライダーはHumanoid Bone（Head等）にアタッチされており、
 * offset/tailはローカル座標系で定義されている。
 * マイグレーション後、Humanoid Boneの回転はidentityになるが、
 * ローカル座標系自体がY軸180度回転しているため、
 * コライダーのオフセットも同様に回転する必要がある。
 *
 * @param vrm - VRMオブジェクト
 */
export function rotateSpringBoneColliderOffsets(vrm: VRM): void {
  if (!vrm.springBoneManager) {
    return
  }

  const colliders = vrm.springBoneManager.colliders
  if (!colliders || colliders.length === 0) {
    return
  }

  const rotationMatrix = new Matrix4().makeRotationY(Math.PI)

  for (const collider of colliders) {
    const shape = collider.shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shapeAny = shape as any

    // sphere型とcapsule型の両方でoffsetプロパティがある
    if (shapeAny.offset instanceof Vector3) {
      shapeAny.offset.applyMatrix4(rotationMatrix)
    }

    // capsule型の場合はtailプロパティもある
    if (shapeAny.tail instanceof Vector3) {
      shapeAny.tail.applyMatrix4(rotationMatrix)
    }
  }
}

/**
 * VRM0→VRM1マイグレーション後にSpringBone関連の調整を一括で実行
 *
 * 以下の処理を順番に実行:
 * 1. 末端ジョイントに仮想tailノードを作成
 * 2. 重力方向（gravityDir）をY軸180度回転
 * 3. コライダーオフセットをY軸180度回転
 * 4. SpringBoneの初期状態を再設定
 *
 * @param vrm - VRMオブジェクト
 * @returns 作成された仮想tailノードの配列（クリーンアップ用）
 */
export function migrateSpringBone(vrm: VRM): Bone[] {
  // 末端ジョイントに仮想tailノードを作成
  const tailNodes = createVirtualTailNodes(vrm)

  // 重力方向をY軸180度回転
  rotateSpringBoneGravityDirections(vrm)

  // コライダーオフセットをY軸180度回転
  rotateSpringBoneColliderOffsets(vrm)

  // SpringBoneの初期状態を再設定
  vrm.springBoneManager?.setInitState()
  vrm.springBoneManager?.reset()

  return tailNodes
}
