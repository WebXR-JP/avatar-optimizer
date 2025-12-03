import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { GridHelper, DirectionalLight, AmbientLight, AnimationMixer, type Mesh, SkeletonHelper, type Group, type LineBasicMaterial, type Material } from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { VRMSpringBoneColliderHelper } from '@pixiv/three-vrm'
import { createVRMAnimationClip, type VRMAnimation } from '@pixiv/three-vrm-animation'
import { MToonAtlasMaterial, type DebugMode } from '@xrift/mtoon-atlas'
import { createBonePointsHelper, updateBonePointsHelper } from '../utils/skeleton-helper'

interface VRMSceneProps
{
  vrm: VRM | null
  vrmAnimation: VRMAnimation | null
  debugMode: DebugMode
  springBoneEnabled?: boolean
  showBones?: boolean
  showColliders?: boolean
}

/**
 * React Three Fiberのシーンコンポーネント。
 * ライティング、グリッド、VRMモデルの配置を管理します。
 * OrbitControls でマウスによるカメラ操作を提供します。
 */
function VRMScene({ vrm, vrmAnimation, debugMode, springBoneEnabled = true, showBones = false, showColliders = false }: VRMSceneProps)
{
  const { scene } = useThree()
  const mixerRef = useRef<AnimationMixer | null>(null)
  const skeletonHelperRef = useRef<SkeletonHelper | null>(null)
  const bonePointsRef = useRef<Group | null>(null)
  const colliderHelpersRef = useRef<VRMSpringBoneColliderHelper[]>([])

  // VRMをシーンに追加/削除
  useEffect(() =>
  {
    if (!vrm) return

    scene.add(vrm.scene)
    vrm.scene.position.set(0, 0, 0)

    return () =>
    {
      scene.remove(vrm.scene)
    }
  }, [vrm, scene])

  // アニメーションのセットアップ
  useEffect(() =>
  {
    if (!vrm || !vrmAnimation) return

    const clip = createVRMAnimationClip(vrmAnimation, vrm)
    const mixer = new AnimationMixer(vrm.scene)
    mixer.clipAction(clip).play()
    mixerRef.current = mixer

    return () =>
    {
      mixer.stopAllAction()
      mixerRef.current = null
    }
  }, [vrm, vrmAnimation])

  // デバッグモードの変更をマテリアルに適用
  useEffect(() =>
  {
    if (!vrm) return

    vrm.scene.traverse((object) =>
    {
      const mesh = object as Mesh
      if (!mesh.isMesh) return

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials)
      {
        if (material instanceof MToonAtlasMaterial)
        {
          material.setDebugMode(debugMode)
        }
      }
    })
  }, [vrm, debugMode])

  // SpringBone無効時にリセット
  useEffect(() =>
  {
    if (!vrm || springBoneEnabled) return
    vrm.springBoneManager?.reset()
  }, [vrm, springBoneEnabled])

  // ボーン可視化ヘルパーの管理
  useEffect(() =>
  {
    if (!vrm) return

    // 古いヘルパーを削除
    if (skeletonHelperRef.current)
    {
      scene.remove(skeletonHelperRef.current)
      skeletonHelperRef.current = null
    }
    if (bonePointsRef.current)
    {
      scene.remove(bonePointsRef.current)
      bonePointsRef.current = null
    }

    if (showBones)
    {
      // SkeletonHelperを作成
      const skeletonHelper = new SkeletonHelper(vrm.scene)
      skeletonHelper.visible = true
      const material = skeletonHelper.material as LineBasicMaterial
      material.color.setHex(0x00ff00)
      material.depthTest = false
      material.depthWrite = false
      scene.add(skeletonHelper)
      skeletonHelperRef.current = skeletonHelper

      // ボーンポイントを作成
      const bonePoints = createBonePointsHelper(vrm)
      scene.add(bonePoints)
      bonePointsRef.current = bonePoints
    }

    return () =>
    {
      if (skeletonHelperRef.current)
      {
        scene.remove(skeletonHelperRef.current)
        skeletonHelperRef.current = null
      }
      if (bonePointsRef.current)
      {
        scene.remove(bonePointsRef.current)
        bonePointsRef.current = null
      }
    }
  }, [vrm, showBones, scene])

  // コライダー可視化ヘルパーの管理
  useEffect(() =>
  {
    if (!vrm) return

    // 古いヘルパーを削除
    colliderHelpersRef.current.forEach(helper => scene.remove(helper))
    colliderHelpersRef.current = []

    if (showColliders && vrm.springBoneManager)
    {
      // 各コライダーに対してヘルパーを作成
      vrm.springBoneManager.colliders.forEach(collider =>
      {
        const helper = new VRMSpringBoneColliderHelper(collider)
        // 常に手前に表示されるようにdepthTestを無効化
        helper.traverse(child =>
        {
          const mesh = child as Mesh
          if (mesh.isMesh && mesh.material)
          {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            materials.forEach((mat: Material) =>
            {
              mat.depthTest = false
              mat.depthWrite = false
            })
          }
        })
        helper.renderOrder = 999
        scene.add(helper)
        colliderHelpersRef.current.push(helper)
      })
    }

    return () =>
    {
      colliderHelpersRef.current.forEach(helper => scene.remove(helper))
      colliderHelpersRef.current = []
    }
  }, [vrm, showColliders, scene])

  // アニメーションループ
  useFrame((_state, delta) =>
  {
    const dt = Math.min(delta, 0.05)
    if (mixerRef.current)
    {
      mixerRef.current.update(dt)
    }
    if (vrm)
    {
      if (springBoneEnabled)
      {
        // 全体更新（SpringBone含む）
        vrm.update(dt)
      } else
      {
        // SpringBone以外を個別に更新
        vrm.humanoid?.update()
        vrm.nodeConstraintManager?.update()
        vrm.expressionManager?.update()
        vrm.lookAt?.update(dt)
      }

      // ボーンポイントの位置を更新
      if (bonePointsRef.current)
      {
        updateBonePointsHelper(vrm, bonePointsRef.current)
      }

      // コライダーヘルパーの位置を更新
      colliderHelpersRef.current.forEach(helper => helper.updateMatrixWorld(true))
    }
  })

  // ライティングとグリッド（マウント時のみ）
  useEffect(() =>
  {
    // グリッドヘルパー
    const gridHelper = new GridHelper(5, 10, 0x444444, 0x333333)
    gridHelper.position.y = 0
    scene.add(gridHelper)

    // 主光（太陽光）
    const directionalLight = new DirectionalLight(0xffffff, 1.5)
    directionalLight.position.set(1, 2, 1).normalize()
    scene.add(directionalLight)

    // 環境光（柔らかい全方向光）
    const ambientLight = new AmbientLight(0xffffff, 0.7)
    scene.add(ambientLight)

    return () =>
    {
      scene.remove(gridHelper)
      scene.remove(directionalLight)
      scene.remove(ambientLight)
    }
  }, [scene])

  return (
    <>
      <OrbitControls
        autoRotate={false}
        dampingFactor={0.1}
        enableDamping
        enableZoom
        enablePan
      />
    </>
  )
}

export default VRMScene
