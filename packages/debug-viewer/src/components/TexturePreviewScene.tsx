import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { PlaneGeometry, MeshBasicMaterial, Mesh, Texture, OrthographicCamera } from 'three'

interface TexturePreviewSceneProps {
  texture: Texture | null
}

/**
 * Three.js のシーンでテクスチャを Plane 上に表示するコンポーネント
 */
function TexturePreviewScene({ texture }: TexturePreviewSceneProps) {
  const { scene, camera, size } = useThree()
  const meshRef = useRef<Mesh | null>(null)

  useEffect(() => {
    if (!texture) {
      // テクスチャがない場合はメッシュを削除
      if (meshRef.current) {
        scene.remove(meshRef.current)
        meshRef.current = null
      }
      return
    }

    // 既存のメッシュをクリア
    if (meshRef.current) {
      scene.remove(meshRef.current)
    }

    // テクスチャを表示する Plane を作成
    const geometry = new PlaneGeometry(2, 2)
    const material = new MeshBasicMaterial({ map: texture })
    const plane = new Mesh(geometry, material)

    // テクスチャを上下反転して表示
    plane.scale.y = -1

    scene.add(plane)
    meshRef.current = plane

    return () => {
      scene.remove(plane)
      geometry.dispose()
      material.dispose()
    }
  }, [texture, scene])

  // ウィンドウサイズに応じてカメラのzoomを調整
  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return

    // 2×2のPlaneが画面内に収まるように、小さい方の辺に合わせてzoomを計算
    const aspectRatio = size.width / size.height
    const targetSize = 2 // Planeのサイズ

    if (aspectRatio > 1) {
      // 横長の場合は高さに合わせる
      camera.zoom = size.height / targetSize
    } else {
      // 縦長の場合は幅に合わせる
      camera.zoom = size.width / targetSize
    }

    camera.updateProjectionMatrix()
  }, [camera, size])

  return null
}

export default TexturePreviewScene
