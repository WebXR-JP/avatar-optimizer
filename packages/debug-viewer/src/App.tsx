import { useCallback, useEffect, useState } from 'react'
import { Box, Tabs, Tab } from '@mui/material'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import type { VRM } from '@pixiv/three-vrm'
import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import { Mesh, SkinnedMesh } from 'three'
import { VRMCanvas, TextureViewer, SceneInspector } from './components'
import { loadVRM, loadVRMFromFile, replaceVRMTextures, loadVRMAnimation } from './hooks'
import { optimizeModel, exportVRM, migrateSkeletonVRM0ToVRM1, migrateSpringBone, simplifyMeshes, type AtlasGenerationOptions, type SimplifyStatistics, type TextureCompressionOptions } from '@webxr-jp/avatar-optimizer'
import type { DebugMode } from '@webxr-jp/mtoon-atlas'
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
  const [showPointLights, setShowPointLights] = useState(false)
  const [logShaderInfo, setLogShaderInfo] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const [atlasOptions, setAtlasOptions] = useState<AtlasGenerationOptions>({
    defaultResolution: 2048,
  })
  const [lastExportSize, setLastExportSize] = useState<number | null>(null)
  const [isSimplifying, setIsSimplifying] = useState(false)
  const [lastSimplifyStats, setLastSimplifyStats] = useState<SimplifyStatistics | null>(null)

  // エラーを設定すると同時にコンソールにも出力するヘルパー
  const setErrorWithLog = useCallback((message: string | null) =>
  {
    if (message)
    {
      console.error(message)
    }
    setError(message)
  }, [])

  // テクスチャ圧縮オプション（デフォルト有効）
  const textureCompressionOptions: TextureCompressionOptions = {
    supercompression: true,
  }

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
        setErrorWithLog(result.error.message)
        setIsLoading(false)
        return
      }

      setVRM(result.value)
      setIsLoading(false)
    }

    loadDefaultVRM()
  }, [setErrorWithLog])

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
        setErrorWithLog(result.error.message)
        setIsLoading(false)
        return
      }

      setVRM(result.value)
      setIsLoading(false)
    },
    [setErrorWithLog],
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
      setErrorWithLog(`Optimization failed (${err.type}): ${err.message}`)
      setIsOptimizing(false)
      return
    }

    const optimizationResult = result.value
    if (optimizationResult.groups.size > 0)
    {
      console.log('Optimization successful:', optimizationResult.statistics)
    }
    setIsOptimizing(false)
  }, [vrm, atlasOptions, setErrorWithLog])

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
      setErrorWithLog(`Optimization failed (${err.type}): ${err.message}`)
      setIsOptimizing(false)
      return
    }

    console.log('Optimization (without migration) successful:', result.value.statistics)
    setIsOptimizing(false)
  }, [vrm, atlasOptions, setErrorWithLog])

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
      setErrorWithLog(`Migration failed (${err.type}): ${err.message}`)
      // SpringBoneManagerを復元
      ;(vrm as any).springBoneManager = springBoneManager
      return
    }

    // SpringBoneManagerを復元（migrateSpringBoneがspringBoneManagerを使うため）
    ;(vrm as any).springBoneManager = springBoneManager

    // SpringBone関連の調整を一括で実行
    migrateSpringBone(vrm)

    console.log('Migration successful')
  }, [vrm, setErrorWithLog])

  // メッシュ簡略化のみ（デバッグ用）
  const handleSimplifyOnly = useCallback(async () =>
  {
    if (!vrm) return

    setIsSimplifying(true)
    setError(null)

    // 表情メッシュを特定（簡略化から除外）
    const excludedMeshes = new Set<import('three').Mesh>()
    if (vrm.expressionManager)
    {
      for (const expression of vrm.expressionManager.expressions)
      {
        for (const bind of expression.binds)
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bindAny = bind as any

          // MorphTargetBind
          if (bindAny.primitives)
          {
            for (const mesh of bindAny.primitives)
            {
              if (mesh && mesh.isMesh)
              {
                excludedMeshes.add(mesh)
              }
            }
          }
        }
      }
    }

    const result = await simplifyMeshes(vrm.scene, excludedMeshes, {
      targetRatio: 0.5, // 50%に削減
      morphTargetHandling: 'skip',
    })

    if (result.isErr())
    {
      const err = result.error
      setErrorWithLog(`Simplify failed (${err.type}): ${err.message}`)
      setIsSimplifying(false)
      return
    }

    const stats = result.value
    setLastSimplifyStats(stats)
    console.log('Simplify successful:', stats)
    console.log(`頂点: ${stats.originalVertexCount} -> ${stats.simplifiedVertexCount} (${(stats.vertexReductionRatio * 100).toFixed(1)}% 削減)`)
    console.log(`インデックス: ${stats.originalIndexCount} -> ${stats.simplifiedIndexCount} (${(stats.indexReductionRatio * 100).toFixed(1)}% 削減)`)

    // デバッグ: 簡略化後のメッシュ状態を確認
    console.log('=== Simplified Mesh Debug Info ===')
    vrm.scene.traverse((obj) =>
    {
      if (obj instanceof Mesh)
      {
        const geo = obj.geometry
        const posAttr = geo.getAttribute('position')
        const normalAttr = geo.getAttribute('normal')
        const skinIndexAttr = geo.getAttribute('skinIndex')
        const skinWeightAttr = geo.getAttribute('skinWeight')

        // 位置データにNaN/Infinityがないか確認
        let hasInvalidPosition = false
        if (posAttr)
        {
          for (let i = 0; i < Math.min(posAttr.count * 3, 100); i++)
          {
            if (!Number.isFinite(posAttr.array[i]))
            {
              hasInvalidPosition = true
              break
            }
          }
        }

        // SkinnedMesh固有の情報
        let skeletonInfo = null
        if (obj instanceof SkinnedMesh)
        {
          const skeleton = obj.skeleton
          skeletonInfo = skeleton
            ? {
              boneCount: skeleton.bones.length,
              boneMatricesLength: skeleton.boneMatrices?.length,
              hasBoneTexture: !!skeleton.boneTexture,
            }
            : 'no skeleton'
        }

        // skinIndex の値を確認（不正な値がないか）
        let maxSkinIndex = -1
        let hasInvalidSkinIndex = false
        if (skinIndexAttr)
        {
          for (let i = 0; i < skinIndexAttr.count * 4; i++)
          {
            const idx = skinIndexAttr.array[i]
            if (idx > maxSkinIndex) maxSkinIndex = idx
            if (!Number.isFinite(idx) || idx < 0)
            {
              hasInvalidSkinIndex = true
            }
          }
        }

        console.log({
          name: obj.name,
          type: obj.type,
          visible: obj.visible,
          frustumCulled: obj.frustumCulled,
          vertexCount: posAttr?.count,
          indexCount: geo.index?.count,
          indexType: geo.index?.array.constructor.name,
          drawRange: geo.drawRange,
          groups: geo.groups,
          groupsCount: geo.groups.length,
          boundingSphere: geo.boundingSphere
            ? { center: geo.boundingSphere.center.toArray(), radius: geo.boundingSphere.radius }
            : null,
          hasInvalidPosition,
          hasNormal: !!normalAttr,
          hasSkinIndex: !!skinIndexAttr,
          hasSkinWeight: !!skinWeightAttr,
          maxSkinIndex,
          hasInvalidSkinIndex,
          skeletonInfo,
          materialVisible: Array.isArray(obj.material)
            ? obj.material.map((m) => m.visible)
            : obj.material?.visible,
          materialCount: Array.isArray(obj.material) ? obj.material.length : 1,
        })
      }
    })
    console.log('=== End Debug Info ===')

    setIsSimplifying(false)
  }, [vrm, setErrorWithLog])

  const handleReplaceTextures = useCallback(async () =>
  {
    if (!vrm) return

    setIsReplacingTextures(true)
    setError(null)

    const result = await replaceVRMTextures(vrm, '/uv.png')

    if (result.isErr())
    {
      setErrorWithLog(`Texture replacement failed: ${result.error.message}`)
    }

    setIsReplacingTextures(false)
  }, [vrm, setErrorWithLog])

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
      setErrorWithLog(`Export failed: ${String(err)}`)
    }
  }, [vrm, setErrorWithLog])

  const handleExportGLTF = useCallback(async () =>
  {
    if (!vrm) return

    const result = await exportVRM(vrm, { textureCompression: textureCompressionOptions })

    if (result.isErr())
    {
      setErrorWithLog(`VRM export failed: ${result.error.message}`)
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
  }, [vrm, setLastExportSize, setErrorWithLog])

  const handlePlayAnimation = useCallback(async () =>
  {
    setIsLoading(true)
    setError(null)

    const result = await loadVRMAnimation('/vrma/VRMA_03.vrma')

    if (result.isErr())
    {
      setErrorWithLog(result.error.message)
      setIsLoading(false)
      return
    }

    setVRMAnimation(result.value)
    setIsLoading(false)
  }, [setErrorWithLog])

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

    const exportResult = await exportVRM(vrm, { textureCompression: textureCompressionOptions })

    if (exportResult.isErr())
    {
      setErrorWithLog(`Export for reload failed: ${exportResult.error.message}`)
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
      setErrorWithLog(`Reload failed: ${loadResult.error.message}`)
      setIsReloading(false)
      restoreSpringBone()
      return
    }

    setVRM(loadResult.value)
    setVRMAnimation(null)
    setIsReloading(false)
    restoreSpringBone()
  }, [vrm, springBoneEnabled, setErrorWithLog])

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
          showPointLights={showPointLights}
          onShowPointLightsChange={setShowPointLights}
          logShaderInfo={logShaderInfo}
          onLogShaderInfoChange={setLogShaderInfo}
          onReloadExport={handleReloadExport}
          isReloading={isReloading}
          atlasOptions={atlasOptions}
          onAtlasOptionsChange={setAtlasOptions}
          lastExportSize={lastExportSize}
          onSimplifyOnly={handleSimplifyOnly}
          isSimplifying={isSimplifying}
          lastSimplifyStats={lastSimplifyStats}
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
