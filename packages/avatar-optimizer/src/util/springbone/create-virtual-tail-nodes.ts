import type { VRM } from '@pixiv/three-vrm'
import { Bone, Vector3 } from 'three'

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
        direction = preRecordedDirections.get(bone)!.clone().multiplyScalar(0.07)
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
