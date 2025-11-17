import React, { useCallback, useRef, useState } from 'react'
import type { VRM } from '@pixiv/three-vrm'
import { optimizeModelMaterials } from '@xrift/avatar-optimizer'
import VRMCanvas from './VRMCanvas'
import './Viewport3D.css'

interface Viewport3DProps {
  vrm: VRM | null
  isLoading: boolean
  error: string | null
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onError: (error: string) => void
}

/**
 * 3D ビューポート コンポーネント。
 * VRM モデルを表示し、ファイルアップロード、最適化を管理します。
 */
function Viewport3D({
  vrm,
  isLoading,
  error,
  onFileChange,
  onError,
}: Viewport3DProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleOptimizeClick = useCallback(async () => {
    if (!vrm) return

    setIsOptimizing(true)
    onError('')

    try {
      await optimizeModelMaterials(vrm.scene)
    } catch (err) {
      onError(`Optimization failed: ${String(err)}`)
    } finally {
      setIsOptimizing(false)
    }
  }, [vrm, onError])

  return (
    <div className="viewport-3d">
      <div className="viewport-3d__header">
        <h1>VRM Debug Viewer</h1>
        <button
          className="viewport-3d__upload-btn"
          onClick={handleButtonClick}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Upload VRM'}
        </button>
        <button
          className="viewport-3d__optimize-btn"
          onClick={handleOptimizeClick}
          disabled={!vrm || isOptimizing}
        >
          {isOptimizing ? 'Optimizing...' : 'Optimize Material'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".vrm"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {error && <div className="viewport-3d__error">{error}</div>}

      <div className="viewport-3d__canvas-container">
        <VRMCanvas vrm={vrm} />
      </div>

      {vrm && (
        <div className="viewport-3d__info">
          <p>VRM loaded: {vrm.scene.name || 'Unnamed Model'}</p>
        </div>
      )}
    </div>
  )
}

export default Viewport3D
