import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'

/**
 * VRM用のSkeletonHelperを作成
 * SkinnedMeshからスケルトンを取得してヘルパーを生成する
 */
export function createSkeletonHelper(vrm: VRM): THREE.SkeletonHelper | null
{
  // VRMシーンからSkinnedMeshを探してスケルトンを取得
  let skeleton: THREE.Skeleton | null = null

  vrm.scene.traverse((object) =>
  {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh && !skeleton)
    {
      const skinnedMesh = object as THREE.SkinnedMesh
      skeleton = skinnedMesh.skeleton
    }
  })

  if (!skeleton)
  {
    console.warn('No skeleton found in VRM')
    return null
  }

  // SkeletonHelperはルートボーンを渡す必要がある
  // VRMの場合、scene自体をルートとして使う
  const helper = new THREE.SkeletonHelper(vrm.scene)
  helper.visible = true

  // ボーンの色を設定（緑色系）
  const material = helper.material as THREE.LineBasicMaterial
  material.color.setHex(0x00ff00)
  material.linewidth = 2
  material.depthTest = false
  material.depthWrite = false

  return helper
}

/**
 * ボーン位置を示す球体を作成
 * 各ボーンの位置に小さな球体を配置
 */
export function createBonePointsHelper(vrm: VRM, radius: number = 0.008): THREE.Group
{
  const group = new THREE.Group()
  group.name = 'BonePointsHelper'

  const geometry = new THREE.SphereGeometry(radius, 8, 8)
  const material = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    depthTest: false,
    depthWrite: false,
  })

  vrm.scene.traverse((object) =>
  {
    if ((object as THREE.Bone).isBone)
    {
      const bone = object as THREE.Bone
      const sphere = new THREE.Mesh(geometry, material)
      sphere.name = `BonePoint_${bone.name}`

      // ボーンのワールド位置を取得
      const worldPos = new THREE.Vector3()
      bone.getWorldPosition(worldPos)
      sphere.position.copy(worldPos)

      group.add(sphere)
    }
  })

  return group
}

/**
 * ボーンポイントのワールド位置を更新
 * アニメーション中に呼び出してボーン位置を追従させる
 */
export function updateBonePointsHelper(vrm: VRM, group: THREE.Group): void
{
  vrm.scene.traverse((object) =>
  {
    if ((object as THREE.Bone).isBone)
    {
      const bone = object as THREE.Bone
      const sphere = group.getObjectByName(`BonePoint_${bone.name}`)

      if (sphere)
      {
        const worldPos = new THREE.Vector3()
        bone.getWorldPosition(worldPos)
        sphere.position.copy(worldPos)
      }
    }
  })
}
