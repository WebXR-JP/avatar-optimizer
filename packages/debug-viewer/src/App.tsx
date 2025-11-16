import { useCallback, useEffect, useState } from 'react'
import { Box, Tabs, Tab } from '@mui/material'
import type { VRM } from '@pixiv/three-vrm'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { VRMCanvas, TextureViewer } from './components'
import { loadVRM, loadVRMFromFile, replaceVRMTextures } from './hooks'
import { setAtlasTexturesToObjectsWithCorrectUV } from '@xrift/avatar-optimizer'
import './App.css'

function App() {
  const [currentTab, setCurrentTab] = useState(0)
  const [vrm, setVRM] = useState<VRM | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [isReplacingTextures, setIsReplacingTextures] = useState(false)

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue)
  }

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

  const handleOptimize = useCallback(async () => {
    if (!vrm) return

    setIsOptimizing(true)
    setError(null)

    try {
      await setAtlasTexturesToObjectsWithCorrectUV(vrm.scene)
    } catch (err) {
      setError(`Optimization failed: ${String(err)}`)
    } finally {
      setIsOptimizing(false)
    }
  }, [vrm])

  const handleReplaceTextures = useCallback(async () => {
    if (!vrm) return

    setIsReplacingTextures(true)
    setError(null)

    const result = await replaceVRMTextures(vrm, '/uv.png')

    if (result.isErr()) {
      setError(`Texture replacement failed: ${result.error.message}`)
    }

    setIsReplacingTextures(false)
  }, [vrm])

  const handleExportScene = useCallback(() => {
    if (!vrm) return

    try {
      const sceneData = vrm.scene.toJSON()
      const jsonString = JSON.stringify(sceneData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${vrm.scene.name || 'vrm-scene'}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(`Export failed: ${String(err)}`)
    }
  }, [vrm])

  const handleExportGLTF = useCallback(() => {
    if (!vrm) return

    const exporter = new GLTFExporter()

    exporter.parse(
      vrm.scene,
      (result) => {
        try {
          let blob: Blob
          let filename: string

          if (result instanceof ArrayBuffer) {
            // Binary GLTF (.glb)
            blob = new Blob([result], { type: 'application/octet-stream' })
            filename = `${vrm.scene.name || 'vrm-model'}.glb`
          } else {
            // JSON GLTF (.gltf)
            const jsonString = JSON.stringify(result, null, 2)
            blob = new Blob([jsonString], { type: 'application/json' })
            filename = `${vrm.scene.name || 'vrm-model'}.gltf`
          }

          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        } catch (err) {
          setError(`GLTF export failed: ${String(err)}`)
        }
      },
      (error) => {
        setError(`GLTF export failed: ${String(error)}`)
      },
      {
        binary: true, // .glb形式で出力
        trs: false,
        onlyVisible: true,
      },
    )
  }, [vrm])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Tabs value={currentTab} onChange={handleTabChange}>
        <Tab label="3D Viewport" />
        <Tab label="Textures" />
        <Tab label="Settings" />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Canvas は常にレンダリング（コンテキスト保持） */}
        <VRMCanvas
          vrm={vrm}
          currentTab={currentTab}
          isLoading={isLoading}
          error={error}
          onFileChange={handleFileChange}
          onOptimize={handleOptimize}
          isOptimizing={isOptimizing}
          onExportScene={handleExportScene}
          onExportGLTF={handleExportGLTF}
          onReplaceTextures={handleReplaceTextures}
          isReplacingTextures={isReplacingTextures}
        />

        {/* Textures タブの場合はオーバーレイ */}
        {currentTab === 1 && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'white',
              overflow: 'auto',
              zIndex: 10,
            }}
          >
            <TextureViewer vrm={vrm} />
          </Box>
        )}

        {/* Settings タブの場合はオーバーレイ */}
        {currentTab === 2 && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'white',
              overflow: 'auto',
              zIndex: 10,
              p: 2,
            }}
          >
            <p>Settings tab (coming soon)</p>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default App
