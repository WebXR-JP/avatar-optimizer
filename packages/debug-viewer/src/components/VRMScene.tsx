import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { GridHelper, DirectionalLight, AmbientLight, AnimationMixer, type Mesh } from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { createVRMAnimationClip, type VRMAnimation } from '@pixiv/three-vrm-animation'
import { MToonAtlasMaterial, type DebugMode } from '@xrift/mtoon-atlas'

interface VRMSceneProps
{
  vrm: VRM | null
  vrmAnimation: VRMAnimation | null
  debugMode: DebugMode
}

/**
 * React Three Fiberのシーンコンポーネント。
 * ライティング、グリッド、VRMモデルの配置を管理します。
 * OrbitControls でマウスによるカメラ操作を提供します。
 */
function VRMScene({ vrm, vrmAnimation, debugMode }: VRMSceneProps)
{
  const { scene } = useThree()
  const mixerRef = useRef<AnimationMixer | null>(null)

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
      vrm.update(dt)
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
