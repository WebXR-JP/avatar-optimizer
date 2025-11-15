import { useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import type { VRM } from '@pixiv/three-vrm'
import VRMScene from './VRMScene'

interface VRMCanvasProps {
  vrm: VRM | null
}

/**
 * React Three Fiberのキャンバスをラップするコンポーネント。
 * VRMモデルを表示するための3Dシーンを提供します。
 */
function VRMCanvas({ vrm }: VRMCanvasProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleResize = () => {
      if (canvasContainerRef.current) {
        const canvas = canvasContainerRef.current.querySelector('canvas')
        if (canvas) {
          const rect = canvasContainerRef.current.getBoundingClientRect()
          canvas.style.width = `${rect.width}px`
          canvas.style.height = `${rect.height}px`
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
          aspect: 800 / 600,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: true,
          alpha: true,
        }}
      >
        <VRMScene vrm={vrm} />
      </Canvas>
    </div>
  )
}

export default VRMCanvas
