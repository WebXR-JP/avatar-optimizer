import type { VRM } from '@pixiv/three-vrm'
import { Bone, Vector3 } from 'three'

/**
 * SpringBone末端ジョイントに仮想tailノードを作成
 * VRM1.0仕様ではjointsの最後にtailノードが必要
 * three-vrmと同様に、ボーン方向に7cmのオフセットを持つ仮想ノードを追加
 *
 * @param vrm - VRMオブジェクト
 * @returns 作成された仮想tailノードの配列（クリーンアップ用）
 */
export function createVirtualTailNodes(vrm: VRM): Bone[] {
  const createdTailNodes: Bone[] = []

  if (!vrm.springBoneManager) return createdTailNodes

  const springBoneManager = vrm.springBoneManager
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joints = (springBoneManager as any).joints
  if (!joints || joints.size === 0) return createdTailNodes

  // 末端ジョイント（childを持たないジョイント）を見つけて仮想tailを作成
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  joints.forEach((joint: any) => {
    const bone = joint.bone
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

      // three-vrmと同様のロジック: ボーン方向に7cmオフセット
      // bone.positionを正規化して0.07を掛ける
      const direction = new Vector3().copy(bone.position)
      if (direction.lengthSq() > 0) {
        direction.normalize().multiplyScalar(0.07)
      } else {
        // positionがゼロの場合はY軸方向に7cm
        direction.set(0, 0.07, 0)
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
