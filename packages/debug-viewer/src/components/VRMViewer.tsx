import { useCallback, useEffect, useRef, useState } from 'react'
import type { VRM } from '@pixiv/three-vrm'
import { optimizeModelMaterials } from '@xrift/avatar-optimizer'
import { loadVRM, loadVRMFromFile } from '../hooks'
import VRMCanvas from './VRMCanvas'
import './VRMViewer.css'

/**
 * VRMビューアの完全なUIコンポーネント。
 * ファイルアップロード、VRM読み込み、表示を管理します。
 * 起動時に public/AliciaSolid.vrm をデフォルトで読み込みます。
 */
function VRMViewer() {
  const [vrm, setVRM] = useState<VRM | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 起動時にデフォルト VRM を読み込み
  useEffect(() => {
    const loadDefaultVRM = async () => {
      setIsLoading(true)
      setError(null)

      const result = await loadVRM('/AliciaSolid.vrm')

      if (result.isErr()) {
        setError(result.error.message)
        setIsLoading(false)
        return
      }

      setVRM(result.value)
      setIsLoading(false)
    }

    loadDefaultVRM()
  }, [])

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      setIsLoading(true)
      setError(null)

      const result = await loadVRMFromFile(file)

      if (result.isErr()) {
        setError(result.error.message)
        setIsLoading(false)
        return
      }

      setVRM(result.value)
      setIsLoading(false)
    },
    [],
  )

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleOptimizeClick = useCallback(async () => {
    if (!vrm) return

    setIsOptimizing(true)
    setError(null)

    try {
      await optimizeModelMaterials(vrm.scene)
    } catch (err) {
      console.error(err)
      setError(`Optimization failed: ${String(err)}`)
    } finally {
      setIsOptimizing(false)
    }
  }, [vrm])

  return (
    <div className="vrm-viewer">
      <div className="vrm-viewer__header">
        <h1>VRM Debug Viewer</h1>
        <button
          className="vrm-viewer__upload-btn"
          onClick={handleButtonClick}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Upload VRM'}
        </button>
        <button
          className="vrm-viewer__optimize-btn"
          onClick={handleOptimizeClick}
          disabled={!vrm || isOptimizing}
        >
          {isOptimizing ? 'Optimizing...' : 'Optimize Material'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".vrm"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {error && <div className="vrm-viewer__error">{error}</div>}

      <div className="vrm-viewer__canvas-container">
        <VRMCanvas vrm={vrm} />
      </div>

      {vrm && (
        <div className="vrm-viewer__info">
          <p>VRM loaded: {vrm.scene.name || 'Unnamed Model'}</p>
        </div>
      )}
    </div>
  )
}

export default VRMViewer
