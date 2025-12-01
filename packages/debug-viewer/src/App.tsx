import { useCallback, useEffect, useState } from 'react'
import { Box, Tabs, Tab } from '@mui/material'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import type { VRM } from '@pixiv/three-vrm'
import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import { Scene } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { VRMCanvas, TextureViewer, SceneInspector } from './components'
import { loadVRM, loadVRMFromFile, replaceVRMTextures, loadVRMAnimation } from './hooks'
import { optimizeModel, VRMExporterPlugin } from '@xrift/avatar-optimizer'
import { MToonAtlasExporterPlugin, type DebugMode } from '@xrift/mtoon-atlas'
import './App.css'

function App()
{
  const navigate = useNavigate()
  const location = useLocation()
  const [vrm, setVRM] = useState<VRM | null>(null)
  const [vrmAnimation, setVRMAnimation] = useState<VRMAnimation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [isReplacingTextures, setIsReplacingTextures] = useState(false)
  const [debugMode, setDebugMode] = useState<DebugMode>('none')
  const [springBoneEnabled, setSpringBoneEnabled] = useState(true)

  // URLに基づいて現在のタブインデックスを決定
  const getTabValue = (pathname: string) =>
  {
    if (pathname.startsWith('/textures')) return 1
    if (pathname.startsWith('/inspector')) return 2
    if (pathname.startsWith('/settings')) return 3
    return 0
  }

  const currentTab = getTabValue(location.pathname)

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) =>
  {
    switch (newValue)
    {
      case 0:
        navigate('/')
        break
      case 1:
        navigate('/textures')
        break
      case 2:
        navigate('/inspector')
        break
      case 3:
        navigate('/settings')
        break
      default:
        navigate('/')
    }
  }

  // 起動時にデフォルト VRM を読み込み
  useEffect(() =>
  {
    const loadDefaultVRM = async () =>
    {
      setIsLoading(true)
      setError(null)

      const result = await loadVRM('/AliciaSolid.vrm')

      if (result.isErr())
      {
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
    async (event: React.ChangeEvent<HTMLInputElement>) =>
    {
      const file = event.target.files?.[0]
      if (!file) return

      setIsLoading(true)
      setError(null)

      const result = await loadVRMFromFile(file)

      if (result.isErr())
      {
        setError(result.error.message)
        setIsLoading(false)
        return
      }

      setVRM(result.value)
      setIsLoading(false)
    },
    [],
  )

  const handleOptimize = useCallback(async () =>
  {
    if (!vrm) return

    setIsOptimizing(true)
    setError(null)

    const result = await optimizeModel(vrm, { migrateVRM0ToVRM1: true })

    if (result.isErr())
    {
      const err = result.error
      console.error(err)
      setError(`Optimization failed (${err.type}): ${err.message}`)
      setIsOptimizing(false)
      return
    }

    const optimizationResult = result.value
    if (optimizationResult.groups.size > 0)
    {
      console.log('Optimization successful:', optimizationResult.statistics)
    }
    setIsOptimizing(false)
  }, [vrm])

  const handleReplaceTextures = useCallback(async () =>
  {
    if (!vrm) return

    setIsReplacingTextures(true)
    setError(null)

    const result = await replaceVRMTextures(vrm, '/uv.png')

    if (result.isErr())
    {
      setError(`Texture replacement failed: ${result.error.message}`)
    }

    setIsReplacingTextures(false)
  }, [vrm])

  const handleExportScene = useCallback(() =>
  {
    if (!vrm) return

    try
    {
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
    } catch (err)
    {
      setError(`Export failed: ${String(err)}`)
    }
  }, [vrm])

  const handleExportGLTF = useCallback(() =>
  {
    if (!vrm) return

    const exporter = new GLTFExporter()
    exporter.register((writer: any) => new MToonAtlasExporterPlugin(writer))
    exporter.register((writer: any) =>
    {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(vrm)
      return plugin
    })

    // vrm.scene の子要素を Scene に直接追加してエクスポート
    // これにより GLTFExporter が AuxScene を作成するのを防ぐ
    // VRMHumanoidRig と VRMExpression はランタイムで動的に生成されるため除外
    const exportScene = new Scene()
    const children = [...vrm.scene.children].filter((child) =>
      child.name !== 'VRMHumanoidRig' && !child.name.startsWith('VRMExpression')
    )
    children.forEach((child) => exportScene.add(child))

    exporter.parse(
      exportScene,
      (result) =>
      {
        // エクスポート後、子要素を元のvrm.sceneに戻す
        children.forEach((child) => vrm.scene.add(child))

        try
        {
          let blob: Blob
          let filename: string

          if (result instanceof ArrayBuffer)
          {
            // Binary VRM (.vrm)
            blob = new Blob([result], { type: 'application/octet-stream' })
            filename = `${vrm.scene.name || 'vrm-model'}.vrm`
          } else
          {
            // JSON VRM (.vrm)
            const jsonString = JSON.stringify(result, null, 2)
            blob = new Blob([jsonString], { type: 'application/json' })
            filename = `${vrm.scene.name || 'vrm-model'}.vrm`
          }

          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        } catch (err)
        {
          setError(`VRM export failed: ${String(err)}`)
        }
      },
      (error) =>
      {
        // エラー時も子要素を元に戻す
        children.forEach((child) => vrm.scene.add(child))
        setError(`VRM export failed: ${String(error)}`)
      },
      {
        binary: true, // .vrm形式で出力
        trs: false,
        onlyVisible: true,
      },
    )
  }, [vrm])

  const handlePlayAnimation = useCallback(async () =>
  {
    setIsLoading(true)
    setError(null)

    const result = await loadVRMAnimation('/vrma/VRMA_03.vrma')

    if (result.isErr())
    {
      setError(result.error.message)
      setIsLoading(false)
      return
    }

    setVRMAnimation(result.value)
    setIsLoading(false)
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Tabs value={currentTab} onChange={handleTabChange}>
        <Tab label="3D Viewport" />
        <Tab label="Textures" />
        <Tab label="Scene Inspector" />
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
          vrmAnimation={vrmAnimation}
          onPlayAnimation={handlePlayAnimation}
          debugMode={debugMode}
          onDebugModeChange={setDebugMode}
          springBoneEnabled={springBoneEnabled}
          onSpringBoneEnabledChange={setSpringBoneEnabled}
        />

        {/* Routes でオーバーレイを管理 */}
        <Routes>
          <Route path="/" element={null} />
          <Route
            path="/textures"
            element={
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
            }
          />
          <Route
            path="/inspector"
            element={
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'white',
                  overflow: 'hidden',
                  zIndex: 10,
                }}
              >
                <SceneInspector vrm={vrm} />
              </Box>
            }
          />
          <Route
            path="/settings"
            element={
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
            }
          />
          {/* 未定義のパスはルートにリダイレクト */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
    </Box>
  )
}

export default App
