import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { GridHelper, DirectionalLight, AmbientLight, PointLight, SpotLight, AnimationMixer, Mesh, SkeletonHelper, type Group, type LineBasicMaterial, type Material, PlaneGeometry, MeshStandardMaterial, DoubleSide, BoxGeometry } from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { VRMSpringBoneColliderHelper } from '@pixiv/three-vrm'
import { createVRMAnimationClip, type VRMAnimation } from '@pixiv/three-vrm-animation'
import { MToonAtlasMaterial, type DebugMode } from '@webxr-jp/mtoon-atlas'
import { createBonePointsHelper, updateBonePointsHelper } from '../utils/skeleton-helper'
import { SCENE_LIGHTING } from '../scene-lighting'

interface VRMSceneProps
{
  vrm: VRM | null
  vrmRevision?: number
  isOptimizing?: boolean
  vrmAnimation: VRMAnimation | null
  debugMode: DebugMode
  springBoneEnabled?: boolean
  showBones?: boolean
  showColliders?: boolean
  showPointLights?: boolean
  logShaderInfo?: boolean
}

/**
 * React Three Fiberのシーンコンポーネント。
 * ライティング、グリッド、VRMモデルの配置を管理します。
 * OrbitControls でマウスによるカメラ操作を提供します。
 */
function VRMScene({ vrm, vrmRevision = 0, isOptimizing = false, vrmAnimation, debugMode, springBoneEnabled = true, showBones = false, showColliders = false, showPointLights = false, logShaderInfo = false }: VRMSceneProps)
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

    // 全メッシュに影を落とす設定を追加
    vrm.scene.traverse((object) =>
    {
      if ((object as Mesh).isMesh)
      {
        object.castShadow = true
      }
    })

    return () =>
    {
      scene.remove(vrm.scene)
    }
  }, [vrm, scene])

  // アニメーションのセットアップ
  // 最適化・マイグレーション（vrmRevision の変化）で metaVersion や VRMHumanoidRig が
  // 再構築されるため、クリップとミキサーを作り直す
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
  }, [vrm, vrmAnimation, vrmRevision])

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
  }, [vrm, debugMode, vrmRevision])

  // シェーダーキーワード確認用（onBeforeCompile）
  useEffect(() =>
  {
    if (!vrm || !logShaderInfo) return

    vrm.scene.traverse((object) =>
    {
      const mesh = object as Mesh
      if (!mesh.isMesh) return

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials)
      {
        const originalOnBeforeCompile = material.onBeforeCompile

        material.onBeforeCompile = (shader, renderer) =>
        {
          // 元のonBeforeCompileがあれば呼ぶ
          originalOnBeforeCompile?.call(material, shader, renderer)

          // シェーダー情報をログ出力
          console.log('=== Material:', material.name || material.type, '===')
          console.log('Defines:', (material as Material & { defines?: Record<string, unknown> }).defines)
          console.log('Uniforms:', Object.keys(shader.uniforms))
          // console.log('Vertex Shader:', shader.vertexShader)
          // console.log('Fragment Shader:', shader.fragmentShader)
        }

        // シェーダー再コンパイルをトリガー
        material.needsUpdate = true
      }
    })
  }, [vrm, logShaderInfo])

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
  }, [vrm, showBones, scene, vrmRevision])

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
  }, [vrm, showColliders, scene, vrmRevision])

  // アニメーションループ
  useFrame((_state, delta) =>
  {
    // 最適化処理中はボーン・SpringBone の更新を止め、バインドポーズが崩れないようにする
    if (isOptimizing) return

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

    // 床（影を受け取る）
    const floorGeometry = new PlaneGeometry(10, 10)
    const floorMaterial = new MeshStandardMaterial({
      color: 0xBBBBBB,
      side: DoubleSide,
      roughness: 0.8,
      metalness: 0.2,
    })
    const floor = new Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0
    floor.receiveShadow = true
    scene.add(floor)

    // テスト用キューブ（影のデバッグ用）
    const cubeGeometry = new BoxGeometry(0.3, 0.3, 0.3)
    const cubeMaterial = new MeshStandardMaterial({
      color: 0x44aa88,
      roughness: 0.5,
      metalness: 0.1,
    })
    const cube = new Mesh(cubeGeometry, cubeMaterial)
    cube.position.set(0.5, 0.15, 0.5)
    cube.castShadow = true
    cube.receiveShadow = true
    scene.add(cube)

    // 主光（太陽光）
    const directionalLight = new DirectionalLight(
      SCENE_LIGHTING.directional.color,
      SCENE_LIGHTING.directional.intensity,
    )
    directionalLight.position.set(...SCENE_LIGHTING.directional.position)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = SCENE_LIGHTING.directional.shadowMapSize
    directionalLight.shadow.mapSize.height = SCENE_LIGHTING.directional.shadowMapSize
    directionalLight.shadow.camera.near = 0.1
    directionalLight.shadow.camera.far = 25
    directionalLight.shadow.camera.left = -5
    directionalLight.shadow.camera.right = 5
    directionalLight.shadow.camera.top = 5
    directionalLight.shadow.camera.bottom = -5
    directionalLight.shadow.bias = SCENE_LIGHTING.directional.shadowBias
    scene.add(directionalLight)

    // 環境光（柔らかい全方向光）
    const ambientLight = new AmbientLight(
      SCENE_LIGHTING.ambient.color,
      SCENE_LIGHTING.ambient.intensity,
    )
    scene.add(ambientLight)

    return () =>
    {
      scene.remove(gridHelper)
      scene.remove(floor)
      floorGeometry.dispose()
      floorMaterial.dispose()
      scene.remove(cube)
      cubeGeometry.dispose()
      cubeMaterial.dispose()
      scene.remove(directionalLight)
      scene.remove(ambientLight)
    }
  }, [scene])

  // PointLight（オプション）
  useEffect(() =>
  {
    if (!showPointLights) return

    // ポイントライト1（左斜め前）
    const pointLight1 = new PointLight(0xff0000, 4, 10)
    pointLight1.position.set(-1.5, 1, 1.5)
    pointLight1.castShadow = true
    pointLight1.shadow.mapSize.width = 1024
    pointLight1.shadow.mapSize.height = 1024
    pointLight1.shadow.camera.near = 0.1
    pointLight1.shadow.camera.far = 10
    pointLight1.shadow.bias = -0.001
    scene.add(pointLight1)

    // スポットライト（右斜め後）
    const spotLight = new SpotLight(0x0000ff, 4, 10, Math.PI / 6, 0.5, 1)
    spotLight.position.set(1.5, 2, -1.5)
    spotLight.target.position.set(0, 0.5, 0)
    spotLight.castShadow = true
    spotLight.shadow.mapSize.width = 1024
    spotLight.shadow.mapSize.height = 1024
    spotLight.shadow.camera.near = 0.1
    spotLight.shadow.camera.far = 10
    spotLight.shadow.bias = -0.001
    scene.add(spotLight)
    scene.add(spotLight.target)

    return () =>
    {
      scene.remove(pointLight1)
      scene.remove(spotLight)
      scene.remove(spotLight.target)
    }
  }, [scene, showPointLights])

  return (
    <>
      <OrbitControls
        autoRotate={false}
        dampingFactor={0.1}
        enableDamping
        enableZoom
        enablePan
        target={[0, 1., 0]}
      />
    </>
  )
}

export default VRMScene
