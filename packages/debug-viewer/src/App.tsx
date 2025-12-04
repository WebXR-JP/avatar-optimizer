import { useCallback, useEffect, useState } from 'react'
import { Box, Tabs, Tab } from '@mui/material'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import type { VRM } from '@pixiv/three-vrm'
import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import { VRMCanvas, TextureViewer, SceneInspector } from './components'
import { loadVRM, loadVRMFromFile, replaceVRMTextures, loadVRMAnimation } from './hooks'
import { optimizeModel, exportVRM, migrateSkeletonVRM0ToVRM1, migrateSpringBone, type AtlasGenerationOptions } from '@xrift/avatar-optimizer'
import type { DebugMode } from '@xrift/mtoon-atlas'
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
  const [showBones, setShowBones] = useState(false)
  const [showColliders, setShowColliders] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const [atlasOptions, setAtlasOptions] = useState<AtlasGenerationOptions>({
    defaultResolution: 2048,
  })
  const [lastExportSize, setLastExportSize] = useState<number | null>(null)

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

    const result = await optimizeModel(vrm, { migrateVRM0ToVRM1: true, atlas: atlasOptions })

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
  }, [vrm, atlasOptions])

  // マイグレーションなしの最適化のみ（デバッグ用）
  const handleOptimizeOnly = useCallback(async () =>
  {
    if (!vrm) return

    setIsOptimizing(true)
    setError(null)

    // マイグレーションなしで最適化
    const result = await optimizeModel(vrm, { migrateVRM0ToVRM1: false, atlas: atlasOptions })

    if (result.isErr())
    {
      const err = result.error
      console.error(err)
      setError(`Optimization failed (${err.type}): ${err.message}`)
      setIsOptimizing(false)
      return
    }

    console.log('Optimization (without migration) successful:', result.value.statistics)
    setIsOptimizing(false)
  }, [vrm, atlasOptions])

  // マイグレーションのみ（デバッグ用）
  const handleMigrateOnly = useCallback(() =>
  {
    if (!vrm) return

    setError(null)

    // SpringBoneManagerを一時的に退避（useFrameでのupdate呼び出しを防ぐ）
    const springBoneManager = vrm.springBoneManager
    ;(vrm as any).springBoneManager = null

    // SpringBoneを初期姿勢にリセット
    springBoneManager?.reset()

    // マイグレーション実行
    const result = migrateSkeletonVRM0ToVRM1(vrm.scene)

    if (result.isErr())
    {
      const err = result.error
      console.error(err)
      setError(`Migration failed (${err.type}): ${err.message}`)
      // SpringBoneManagerを復元
      ;(vrm as any).springBoneManager = springBoneManager
      return
    }

    // SpringBoneManagerを復元（migrateSpringBoneがspringBoneManagerを使うため）
    ;(vrm as any).springBoneManager = springBoneManager

    // SpringBone関連の調整を一括で実行
    migrateSpringBone(vrm)

    console.log('Migration successful')
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

  const handleExportGLTF = useCallback(async () =>
  {
    if (!vrm) return

    const result = await exportVRM(vrm)

    if (result.isErr())
    {
      setError(`VRM export failed: ${result.error.message}`)
      return
    }

    const data = result.value
    const blob = new Blob([data], { type: 'application/octet-stream' })
    const filename = `${vrm.scene.name || 'vrm-model'}.vrm`

    // ファイルサイズを記録
    setLastExportSize(blob.size)
    // eslint-disable-next-line no-console
    console.log(`Export file size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [vrm, setLastExportSize])

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

  // Export VRM後にそのまま再読み込みする（エクスポート結果の確認用）
  const handleReloadExport = useCallback(async () =>
  {
    if (!vrm) return

    setIsReloading(true)
    setError(null)

    // エクスポート中の SpringBone 更新を停止（非同期処理中にボーンが動くのを防ぐ）
    const wasSpringBoneEnabled = springBoneEnabled
    setSpringBoneEnabled(false)

    const restoreSpringBone = () =>
    {
      if (wasSpringBoneEnabled)
      {
        setSpringBoneEnabled(true)
      }
    }

    const exportResult = await exportVRM(vrm)

    if (exportResult.isErr())
    {
      setError(`Export for reload failed: ${exportResult.error.message}`)
      setIsReloading(false)
      restoreSpringBone()
      return
    }

    const data = exportResult.value
    const blob = new Blob([data], { type: 'application/octet-stream' })

    // ファイルサイズを記録・表示
    setLastExportSize(blob.size)
    // eslint-disable-next-line no-console
    console.log(`Reload export file size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)

    const loadResult = await loadVRMFromFile(blob)

    if (loadResult.isErr())
    {
      setError(`Reload failed: ${loadResult.error.message}`)
      setIsReloading(false)
      restoreSpringBone()
      return
    }

    setVRM(loadResult.value)
    setVRMAnimation(null)
    setIsReloading(false)
    restoreSpringBone()
  }, [vrm, springBoneEnabled])

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
          onOptimizeOnly={handleOptimizeOnly}
          onMigrateOnly={handleMigrateOnly}
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
          showBones={showBones}
          onShowBonesChange={setShowBones}
          showColliders={showColliders}
          onShowCollidersChange={setShowColliders}
          onReloadExport={handleReloadExport}
          isReloading={isReloading}
          atlasOptions={atlasOptions}
          onAtlasOptionsChange={setAtlasOptions}
          lastExportSize={lastExportSize}
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
