import { useCallback, useRef, useState } from 'react'
import type { VRM } from '@pixiv/three-vrm'
import { loadVRMFromFile } from '../hooks'
import VRMCanvas from './VRMCanvas'
import './VRMViewer.css'

/**
 * VRMビューアの完全なUIコンポーネント。
 * ファイルアップロード、VRM読み込み、表示を管理します。
 */
function VRMViewer() {
  const [vrm, setVRM] = useState<VRM | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
