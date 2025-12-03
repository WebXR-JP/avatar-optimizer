/**
 * SpringBone と Bone の状態をデバッグ用にダンプするユーティリティ
 */
import type { VRM } from '@pixiv/three-vrm'
import type { Quaternion, Vector3 } from 'three'

interface BoneState
{
  name: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  scale: { x: number; y: number; z: number }
}

interface SpringBoneJointState
{
  boneName: string
  childName: string | null
  centerName: string | null
  settings: {
    hitRadius: number
    stiffness: number
    gravityPower: number
    gravityDir: { x: number; y: number; z: number }
    dragForce: number
  }
  // 内部状態（privateだがデバッグ用にアクセス）
  initialLocalRotation?: { x: number; y: number; z: number; w: number }
  currentBoneRotation: { x: number; y: number; z: number; w: number }
}

interface SpringBoneColliderState
{
  nodeName: string
  shapeType: string
  offset: { x: number; y: number; z: number }
  radius: number
  tail?: { x: number; y: number; z: number }
}

interface SpringBoneSnapshot
{
  timestamp: number
  label: string
  bones: BoneState[]
  springBoneJoints: SpringBoneJointState[]
  colliders: SpringBoneColliderState[]
}

function vec3ToObj(v: Vector3): { x: number; y: number; z: number }
{
  return { x: v.x, y: v.y, z: v.z }
}

function quatToObj(q: Quaternion): { x: number; y: number; z: number; w: number }
{
  return { x: q.x, y: q.y, z: q.z, w: q.w }
}

/**
 * SpringBone ボーンの詳細な transform 情報をダンプ
 */
export function dumpSpringBoneTransforms(vrm: VRM, label: string, limit = 5): void
{
  console.group(`🔬 SpringBone Transform Dump: "${label}"`)

  const springBoneManager = vrm.springBoneManager
  if (!springBoneManager)
  {
    console.log('No SpringBoneManager found')
    console.groupEnd()
    return
  }

  let count = 0
  springBoneManager.joints.forEach((joint: any) =>
  {
    if (count >= limit) return
    count++
    const bone = joint.bone
    if (!bone) return

    // ワールド行列を更新
    bone.updateWorldMatrix(true, false)

    console.group(`📍 ${bone.name}`)
    console.log('Local Position:', vec3ToObj(bone.position))
    console.log('Local Rotation (quaternion):', quatToObj(bone.quaternion))
    console.log('Local Scale:', vec3ToObj(bone.scale))

    // ローカル行列
    console.log('Local Matrix:', bone.matrix.elements.map((e: number) => e.toFixed(6)))

    // ワールド行列
    console.log('World Matrix:', bone.matrixWorld.elements.map((e: number) => e.toFixed(6)))

    // 親の情報
    if (bone.parent)
    {
      console.log('Parent:', bone.parent.name, bone.parent.type)
      console.log('Parent Rotation:', quatToObj(bone.parent.quaternion))
    }

    // SpringBone の内部状態
    if (joint._initialLocalRotation)
    {
      console.log('_initialLocalRotation:', quatToObj(joint._initialLocalRotation))
    }

    // child 情報
    if (joint.child)
    {
      console.log('Child:', joint.child.name)
    }

    // center 情報
    if (joint.center)
    {
      console.log('Center:', joint.center.name)
    }

    console.groupEnd()
  })

  console.groupEnd()
}

/**
 * 問題のあるボーンのみを詳細ダンプ
 */
export function dumpProblematicBones(vrm: VRM, label: string): void
{
  const targetBones = ['hair_03_01', 'hair_03_02', 'skirt_01_01', 'skirt_01_02']

  console.group(`🔬 Problematic Bones Dump: "${label}"`)

  const springBoneManager = vrm.springBoneManager
  if (!springBoneManager)
  {
    console.log('No SpringBoneManager found')
    console.groupEnd()
    return
  }

  springBoneManager.joints.forEach((joint: any) =>
  {
    const bone = joint.bone
    if (!bone || !targetBones.includes(bone.name)) return

    bone.updateWorldMatrix(true, false)

    console.group(`📍 ${bone.name}`)
    console.log('Local Rotation:', quatToObj(bone.quaternion))
    console.log('_initialLocalRotation:', joint._initialLocalRotation ? quatToObj(joint._initialLocalRotation) : 'undefined')

    // 親のチェーン
    let parent = bone.parent
    const parentChain: string[] = []
    while (parent)
    {
      parentChain.push(`${parent.name}(${parent.type})`)
      parent = parent.parent
    }
    console.log('Parent Chain:', parentChain.join(' → '))

    // child と center
    console.log('Child:', joint.child?.name || 'null')
    console.log('Center:', joint.center?.name || 'null')

    console.groupEnd()
  })

  console.groupEnd()
}

/**
 * VRM の SpringBone 状態をスナップショットとして取得
 */
export function captureSpringBoneSnapshot(vrm: VRM, label: string): SpringBoneSnapshot
{
  const bones: BoneState[] = []
  const springBoneJoints: SpringBoneJointState[] = []
  const colliders: SpringBoneColliderState[] = []

  // 全ボーンの状態を取得
  vrm.scene.traverse((obj) =>
  {
    // Bone または SpringBone に関連するノードを記録
    if (obj.type === 'Bone' || obj.name.includes('Hair') || obj.name.includes('Skirt'))
    {
      bones.push({
        name: obj.name,
        position: vec3ToObj(obj.position),
        rotation: quatToObj(obj.quaternion),
        scale: vec3ToObj(obj.scale),
      })
    }
  })

  // SpringBone の状態を取得
  const springBoneManager = vrm.springBoneManager
  if (springBoneManager)
  {
    // joints
    springBoneManager.joints.forEach((joint: any) =>
    {
      const state: SpringBoneJointState = {
        boneName: joint.bone?.name || 'unknown',
        childName: joint.child?.name || null,
        centerName: joint.center?.name || null,
        settings: {
          hitRadius: joint.settings.hitRadius,
          stiffness: joint.settings.stiffness,
          gravityPower: joint.settings.gravityPower,
          gravityDir: joint.settings.gravityDir
            ? vec3ToObj(joint.settings.gravityDir)
            : { x: 0, y: -1, z: 0 },
          dragForce: joint.settings.dragForce,
        },
        currentBoneRotation: quatToObj(joint.bone.quaternion),
      }

      // private プロパティにアクセス（デバッグ用）
      if (joint._initialLocalRotation)
      {
        state.initialLocalRotation = quatToObj(joint._initialLocalRotation)
      }

      springBoneJoints.push(state)
    })

    // colliders
    springBoneManager.colliders.forEach((collider: any) =>
    {
      const shape = collider.shape
      const colliderState: SpringBoneColliderState = {
        nodeName: collider.name || 'unknown',
        shapeType: shape?.type || 'unknown',
        offset: shape?.offset ? vec3ToObj(shape.offset) : { x: 0, y: 0, z: 0 },
        radius: shape?.radius || 0,
      }

      if (shape?.type === 'capsule' && shape.tail)
      {
        colliderState.tail = vec3ToObj(shape.tail)
      }

      colliders.push(colliderState)
    })
  }

  return {
    timestamp: Date.now(),
    label,
    bones,
    springBoneJoints,
    colliders,
  }
}

/**
 * 2つのスナップショットを比較して差分を出力
 */
export function compareSnapshots(before: SpringBoneSnapshot, after: SpringBoneSnapshot): void
{
  console.group(`🔍 SpringBone Comparison: "${before.label}" vs "${after.label}"`)

  // SpringBone Joints の比較
  console.group('📌 SpringBone Joints')
  console.log(`Joint count: ${before.springBoneJoints.length} → ${after.springBoneJoints.length}`)

  const beforeJointsMap = new Map(before.springBoneJoints.map(j => [j.boneName, j]))
  const afterJointsMap = new Map(after.springBoneJoints.map(j => [j.boneName, j]))

  // 追加・削除されたジョイント
  const addedJoints = after.springBoneJoints.filter(j => !beforeJointsMap.has(j.boneName))
  const removedJoints = before.springBoneJoints.filter(j => !afterJointsMap.has(j.boneName))

  if (addedJoints.length > 0)
  {
    console.log('➕ Added joints:', addedJoints.map(j => j.boneName))
  }
  if (removedJoints.length > 0)
  {
    console.log('➖ Removed joints:', removedJoints.map(j => j.boneName))
  }

  // 変更されたジョイント
  before.springBoneJoints.forEach(beforeJoint =>
  {
    const afterJoint = afterJointsMap.get(beforeJoint.boneName)
    if (!afterJoint) return

    const diffs: string[] = []

    // settings の比較
    const bs = beforeJoint.settings
    const as = afterJoint.settings

    if (bs.hitRadius !== as.hitRadius)
      diffs.push(`hitRadius: ${bs.hitRadius} → ${as.hitRadius}`)
    if (bs.stiffness !== as.stiffness)
      diffs.push(`stiffness: ${bs.stiffness} → ${as.stiffness}`)
    if (bs.gravityPower !== as.gravityPower)
      diffs.push(`gravityPower: ${bs.gravityPower} → ${as.gravityPower}`)
    if (bs.dragForce !== as.dragForce)
      diffs.push(`dragForce: ${bs.dragForce} → ${as.dragForce}`)

    // gravityDir の比較
    if (bs.gravityDir.x !== as.gravityDir.x ||
        bs.gravityDir.y !== as.gravityDir.y ||
        bs.gravityDir.z !== as.gravityDir.z)
    {
      diffs.push(`gravityDir: [${bs.gravityDir.x}, ${bs.gravityDir.y}, ${bs.gravityDir.z}] → [${as.gravityDir.x}, ${as.gravityDir.y}, ${as.gravityDir.z}]`)
    }

    // initialLocalRotation の比較
    if (beforeJoint.initialLocalRotation && afterJoint.initialLocalRotation)
    {
      const br = beforeJoint.initialLocalRotation
      const ar = afterJoint.initialLocalRotation
      const threshold = 0.0001

      if (Math.abs(br.x - ar.x) > threshold ||
          Math.abs(br.y - ar.y) > threshold ||
          Math.abs(br.z - ar.z) > threshold ||
          Math.abs(br.w - ar.w) > threshold)
      {
        diffs.push(`initialLocalRotation: [${br.x.toFixed(4)}, ${br.y.toFixed(4)}, ${br.z.toFixed(4)}, ${br.w.toFixed(4)}] → [${ar.x.toFixed(4)}, ${ar.y.toFixed(4)}, ${ar.z.toFixed(4)}, ${ar.w.toFixed(4)}]`)
      }
    }

    // currentBoneRotation の比較
    {
      const br = beforeJoint.currentBoneRotation
      const ar = afterJoint.currentBoneRotation
      const threshold = 0.0001

      if (Math.abs(br.x - ar.x) > threshold ||
          Math.abs(br.y - ar.y) > threshold ||
          Math.abs(br.z - ar.z) > threshold ||
          Math.abs(br.w - ar.w) > threshold)
      {
        diffs.push(`currentBoneRotation: [${br.x.toFixed(4)}, ${br.y.toFixed(4)}, ${br.z.toFixed(4)}, ${br.w.toFixed(4)}] → [${ar.x.toFixed(4)}, ${ar.y.toFixed(4)}, ${ar.z.toFixed(4)}, ${ar.w.toFixed(4)}]`)
      }
    }

    if (diffs.length > 0)
    {
      console.log(`⚡ ${beforeJoint.boneName}:`, diffs)
    }
  })

  console.groupEnd()

  // Bones の比較
  console.group('🦴 Bones (with rotation changes)')

  const beforeBonesMap = new Map(before.bones.map(b => [b.name, b]))

  after.bones.forEach(afterBone =>
  {
    const beforeBone = beforeBonesMap.get(afterBone.name)
    if (!beforeBone) return

    const br = beforeBone.rotation
    const ar = afterBone.rotation
    const threshold = 0.0001

    if (Math.abs(br.x - ar.x) > threshold ||
        Math.abs(br.y - ar.y) > threshold ||
        Math.abs(br.z - ar.z) > threshold ||
        Math.abs(br.w - ar.w) > threshold)
    {
      console.log(`🔄 ${afterBone.name}: rotation [${br.x.toFixed(4)}, ${br.y.toFixed(4)}, ${br.z.toFixed(4)}, ${br.w.toFixed(4)}] → [${ar.x.toFixed(4)}, ${ar.y.toFixed(4)}, ${ar.z.toFixed(4)}, ${ar.w.toFixed(4)}]`)
    }
  })

  console.groupEnd()

  // Colliders の比較
  console.group('💥 Colliders')
  console.log(`Before: ${before.colliders.length} colliders`)
  console.log(`After: ${after.colliders.length} colliders`)
  console.groupEnd()

  console.groupEnd()
}

/**
 * スナップショットをコンソールにダンプ
 */
export function dumpSnapshot(snapshot: SpringBoneSnapshot): void
{
  console.group(`📸 SpringBone Snapshot: "${snapshot.label}"`)
  console.log('Timestamp:', new Date(snapshot.timestamp).toISOString())
  console.log('Bones:', snapshot.bones.length)
  console.log('SpringBone Joints:', snapshot.springBoneJoints.length)
  console.log('Colliders:', snapshot.colliders.length)

  console.group('SpringBone Joints Detail')
  snapshot.springBoneJoints.forEach(joint =>
  {
    console.log(`  ${joint.boneName}:`, {
      settings: joint.settings,
      initialLocalRotation: joint.initialLocalRotation,
      currentBoneRotation: joint.currentBoneRotation,
    })
  })
  console.groupEnd()

  console.groupEnd()
}

// グローバルにアクセス可能にする（デバッグ用）
declare global
{
  interface Window
  {
    springBoneDebug: {
      snapshots: SpringBoneSnapshot[]
      capture: (vrm: VRM, label: string) => SpringBoneSnapshot
      compare: (before: SpringBoneSnapshot, after: SpringBoneSnapshot) => void
      dump: (snapshot: SpringBoneSnapshot) => void
      compareLatest: () => void
    }
  }
}

const snapshots: SpringBoneSnapshot[] = []

window.springBoneDebug = {
  snapshots,
  capture: (vrm: VRM, label: string) =>
  {
    const snapshot = captureSpringBoneSnapshot(vrm, label)
    snapshots.push(snapshot)
    console.log(`📸 Captured snapshot "${label}" (total: ${snapshots.length})`)
    return snapshot
  },
  compare: compareSnapshots,
  dump: dumpSnapshot,
  compareLatest: () =>
  {
    if (snapshots.length < 2)
    {
      console.log('Need at least 2 snapshots to compare')
      return
    }
    compareSnapshots(snapshots[snapshots.length - 2], snapshots[snapshots.length - 1])
  },
}

export { }
