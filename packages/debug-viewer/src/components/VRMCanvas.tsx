import { useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { VRM } from '@pixiv/three-vrm'
import type { PerspectiveCamera } from 'three'
import VRMScene from './VRMScene'

interface VRMCanvasProps {
  vrm: VRM | null
}

/**
 * カメラアスペクト比を容器の実際のサイズに動的に調整するコンポーネント
 */
function CameraAspectUpdater() {
  const { camera, size } = useThree()
  const perspectiveCamera = camera as PerspectiveCamera

  useEffect(() => {
    if (perspectiveCamera.type === 'PerspectiveCamera') {
      const aspect = size.width / size.height
      perspectiveCamera.aspect = aspect
      perspectiveCamera.updateProjectionMatrix()
    }
  }, [size, perspectiveCamera])

  return null
}

/**
 * React Three Fiberのキャンバスをラップするコンポーネント。
 * VRMモデルを表示するための3Dシーンを提供します。
 * カメラアスペクト比は容器の実際のサイズに追従します。
 */
function VRMCanvas({ vrm }: VRMCanvasProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={canvasContainerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <Canvas
        camera={{
          position: [0, 1.5, 3],
          fov: 45,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: true,
          alpha: true,
        }}
      >
        <CameraAspectUpdater />
        <VRMScene vrm={vrm} />
      </Canvas>
    </div>
  )
}

export default VRMCanvas
