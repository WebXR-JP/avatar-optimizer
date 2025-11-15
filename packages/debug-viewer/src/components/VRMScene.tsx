import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { GridHelper, DirectionalLight, AmbientLight } from 'three'
import type { VRM } from '@pixiv/three-vrm'

interface VRMSceneProps {
  vrm: VRM | null
}

/**
 * React Three Fiberのシーンコンポーネント。
 * ライティング、グリッド、VRMモデルの配置を管理します。
 */
function VRMScene({ vrm }: VRMSceneProps) {
  const { scene } = useThree()

  // VRMをシーンに追加/削除
  useEffect(() => {
    if (!vrm) return

    scene.add(vrm.scene)
    vrm.scene.position.set(0, 0, 0)

    return () => {
      scene.remove(vrm.scene)
    }
  }, [vrm, scene])

  // ライティングとグリッド（マウント時のみ）
  useEffect(() => {
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

    return () => {
      scene.remove(gridHelper)
      scene.remove(directionalLight)
      scene.remove(ambientLight)
    }
  }, [scene])

  return null
}

export default VRMScene
