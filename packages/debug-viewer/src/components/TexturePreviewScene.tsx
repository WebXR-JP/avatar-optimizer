import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { PlaneGeometry, MeshBasicMaterial, Mesh, Texture } from 'three'

interface TexturePreviewSceneProps {
  texture: Texture | null
}

/**
 * Three.js のシーンでテクスチャを Plane 上に表示するコンポーネント
 */
function TexturePreviewScene({ texture }: TexturePreviewSceneProps) {
  const { scene } = useThree()
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

    scene.add(plane)
    meshRef.current = plane

    return () => {
      scene.remove(plane)
      geometry.dispose()
      material.dispose()
    }
  }, [texture, scene])

  return null
}

export default TexturePreviewScene
