import { useCallback, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { VRM } from '@pixiv/three-vrm'
import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import type { PerspectiveCamera } from 'three'
import VRMScene from './VRMScene'
import { optimizeModel } from '@xrift/avatar-optimizer'
import './VRMCanvas.css'

interface VRMCanvasProps
{
  vrm: VRM | null
  currentTab: number
  isLoading: boolean
  error: string | null
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onOptimize: () => Promise<void>
  isOptimizing: boolean
  onExportScene: () => void
  onExportGLTF: () => void
  onReplaceTextures: () => Promise<void>
  isReplacingTextures: boolean
  vrmAnimation: VRMAnimation | null
  onPlayAnimation: () => Promise<void>
}

/**
 * カメラアスペクト比を容器の実際のサイズに動的に調整するコンポーネント
 */
function CameraAspectUpdater()
{
  const { camera, size } = useThree()
  const perspectiveCamera = camera as PerspectiveCamera

  useEffect(() =>
  {
    if (perspectiveCamera.type === 'PerspectiveCamera')
    {
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
 * タブが3D Viewport の時のみ UI を表示します。
 */
function VRMCanvas({
  vrm,
  currentTab,
  isLoading,
  error,
  onFileChange,
  onOptimize,
  isOptimizing,
  onExportScene,
  onExportGLTF,
  onReplaceTextures,
  isReplacingTextures,
  vrmAnimation,
  onPlayAnimation,
}: VRMCanvasProps)
{
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleButtonClick = useCallback(() =>
  {
    fileInputRef.current?.click()
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
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: true,
          alpha: true,
        }}
      >
        <CameraAspectUpdater />
        <VRMScene vrm={vrm} vrmAnimation={vrmAnimation} />
      </Canvas>

      {/* 3D Viewport タブのときのみ UI を表示 */}
      {currentTab === 0 && (
        <>
          <div className="vrm-canvas__header">
            <h1>VRM Debug Viewer</h1>
            <button
              className="vrm-canvas__upload-btn"
              onClick={handleButtonClick}
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Upload VRM'}
            </button>
            <button
              className="vrm-canvas__optimize-btn"
              onClick={onOptimize}
              disabled={!vrm || isOptimizing}
            >
              {isOptimizing ? 'Optimizing...' : 'Optimize Material'}
            </button>
            <button
              className="vrm-canvas__export-btn"
              onClick={onExportScene}
              disabled={!vrm}
            >
              Export Scene
            </button>
            <button
              className="vrm-canvas__export-gltf-btn"
              onClick={onExportGLTF}
              disabled={!vrm}
            >
              Export GLTF
            </button>
            <button
              className="vrm-canvas__replace-textures-btn"
              onClick={onReplaceTextures}
              disabled={!vrm || isReplacingTextures}
            >
              {isReplacingTextures ? 'Replacing...' : 'Replace Textures with UV'}
            </button>
            <button
              className="vrm-canvas__play-animation-btn"
              onClick={onPlayAnimation}
              disabled={!vrm || !!vrmAnimation}
            >
              {vrmAnimation ? 'Playing Animation' : 'Play Animation'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".vrm"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {error && <div className="vrm-canvas__error">{error}</div>}

          {vrm && (
            <div className="vrm-canvas__info">
              <p>VRM loaded: {vrm.scene.name || 'Unnamed Model'}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default VRMCanvas
