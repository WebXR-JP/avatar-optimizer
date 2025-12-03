import { useCallback, useEffect, useState } from 'react'
import { Box, Tabs, Tab } from '@mui/material'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import type { VRM } from '@pixiv/three-vrm'
import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import { Scene } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { VRMCanvas, TextureViewer, SceneInspector } from './components'
import { loadVRM, loadVRMFromFile, replaceVRMTextures, loadVRMAnimation } from './hooks'
import { optimizeModel, VRMExporterPlugin, migrateSkeletonVRM0ToVRM1, createVirtualTailNodes } from '@xrift/avatar-optimizer'
import { MToonAtlasExporterPlugin, type DebugMode } from '@xrift/mtoon-atlas'
import { captureSpringBoneSnapshot, compareSnapshots, dumpProblematicBones } from './utils/springbone-debug'
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
  const [isReloading, setIsReloading] = useState(false)

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

    // 最適化前の SpringBone 状態をキャプチャ
    const beforeSnapshot = captureSpringBoneSnapshot(vrm, 'Before Optimize')

    const result = await optimizeModel(vrm, { migrateVRM0ToVRM1: true })

    if (result.isErr())
    {
      const err = result.error
      console.error(err)
      setError(`Optimization failed (${err.type}): ${err.message}`)
      setIsOptimizing(false)
      return
    }

    // 最適化後の SpringBone 状態をキャプチャして比較
    const afterSnapshot = captureSpringBoneSnapshot(vrm, 'After Optimize')
    compareSnapshots(beforeSnapshot, afterSnapshot)

    const optimizationResult = result.value
    if (optimizationResult.groups.size > 0)
    {
      console.log('Optimization successful:', optimizationResult.statistics)
    }
    setIsOptimizing(false)
  }, [vrm])

  // マイグレーションなしの最適化のみ（デバッグ用）
  const handleOptimizeOnly = useCallback(async () =>
  {
    if (!vrm) return

    setIsOptimizing(true)
    setError(null)

    const beforeSnapshot = captureSpringBoneSnapshot(vrm, 'Before Optimize (no migration)')

    // マイグレーションなしで最適化
    const result = await optimizeModel(vrm, { migrateVRM0ToVRM1: false })

    if (result.isErr())
    {
      const err = result.error
      console.error(err)
      setError(`Optimization failed (${err.type}): ${err.message}`)
      setIsOptimizing(false)
      return
    }

    const afterSnapshot = captureSpringBoneSnapshot(vrm, 'After Optimize (no migration)')
    compareSnapshots(beforeSnapshot, afterSnapshot)

    console.log('Optimization (without migration) successful:', result.value.statistics)
    setIsOptimizing(false)
  }, [vrm])

  // マイグレーションのみ（デバッグ用）
  const handleMigrateOnly = useCallback(() =>
  {
    if (!vrm) return

    setError(null)

    const beforeSnapshot = captureSpringBoneSnapshot(vrm, 'Before Migration')

    // SpringBoneを初期姿勢にリセット
    vrm.springBoneManager?.reset()

    // マイグレーション実行
    const result = migrateSkeletonVRM0ToVRM1(vrm.scene)

    if (result.isErr())
    {
      const err = result.error
      console.error(err)
      setError(`Migration failed (${err.type}): ${err.message}`)
      return
    }

    // 末端ジョイントに仮想tailノードを作成
    createVirtualTailNodes(vrm)

    // SpringBoneの初期状態を再設定
    vrm.springBoneManager?.setInitState()

    const afterSnapshot = captureSpringBoneSnapshot(vrm, 'After Migration')
    compareSnapshots(beforeSnapshot, afterSnapshot)

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

  const handleExportGLTF = useCallback(() =>
  {
    if (!vrm) return

    // SpringBone を初期状態にリセット（エクスポート時の回転状態を正しく保存するため）
    vrm.springBoneManager?.reset()

    // 現在のボーン状態を SpringBone の初期状態として記録
    vrm.springBoneManager?.setInitState()

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

  // Export VRM後にそのまま再読み込みする（エクスポート結果の確認用）
  const handleReloadExport = useCallback(() =>
  {
    if (!vrm) return

    setIsReloading(true)
    setError(null)

    // エクスポート中の SpringBone 更新を停止（非同期処理中にボーンが動くのを防ぐ）
    const wasSpringBoneEnabled = springBoneEnabled
    setSpringBoneEnabled(false)

    // エクスポート前の SpringBone 状態をキャプチャ
    const beforeExportSnapshot = captureSpringBoneSnapshot(vrm, 'Before Export (pre-reset)')

    // SpringBone を初期状態にリセット（エクスポート時の回転状態を正しく保存するため）
    vrm.springBoneManager?.reset()

    // 現在のボーン状態を SpringBone の初期状態として記録
    // これにより、エクスポート後に読み込んだ際に同じ初期状態が再現される
    vrm.springBoneManager?.setInitState()

    // リセット後の状態もキャプチャ
    const afterResetSnapshot = captureSpringBoneSnapshot(vrm, 'After Reset & SetInitState (pre-export)')
    compareSnapshots(beforeExportSnapshot, afterResetSnapshot)

    // 詳細な transform 情報をダンプ（デバッグ用）
    dumpProblematicBones(vrm, 'Pre-export')

    // 元のVRMの末端ジョイントの情報をダンプ
    console.group('🔬 Original SpringBone End Joints')
    if (vrm.springBoneManager)
    {
      let jointIndex = 0
      vrm.springBoneManager.joints.forEach((joint: any) =>
      {
        // 末端ジョイント（childがないもの）のみ
        if (!joint.child && jointIndex < 5)
        {
          const initChildPos = joint._initialLocalChildPosition
          console.log(`End Joint: ${joint.bone?.name}`, {
            child: 'null',
            _initialLocalChildPosition: initChildPos ? `(${initChildPos.x.toFixed(4)}, ${initChildPos.y.toFixed(4)}, ${initChildPos.z.toFixed(4)})` : null,
            bonePosition: joint.bone?.position ? `(${joint.bone.position.x.toFixed(4)}, ${joint.bone.position.y.toFixed(4)}, ${joint.bone.position.z.toFixed(4)})` : null,
          })
          jointIndex++
        }
      })
    }
    console.groupEnd()

    // エクスポート完了後に SpringBone を復元する関数
    const restoreSpringBone = () =>
    {
      if (wasSpringBoneEnabled)
      {
        setSpringBoneEnabled(true)
      }
    }

    const exporter = new GLTFExporter()
    exporter.register((writer: any) => new MToonAtlasExporterPlugin(writer))
    exporter.register((writer: any) =>
    {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(vrm)
      return plugin
    })

    const exportScene = new Scene()
    const children = [...vrm.scene.children].filter((child) =>
      child.name !== 'VRMHumanoidRig' && !child.name.startsWith('VRMExpression')
    )
    children.forEach((child) => exportScene.add(child))

    // まず JSON 形式でエクスポートしてノードの rotation を確認
    const jsonExporter = new GLTFExporter()
    jsonExporter.register((writer: any) => new MToonAtlasExporterPlugin(writer))
    jsonExporter.register((writer: any) =>
    {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(vrm)
      return plugin
    })

    // JSON形式でエクスポートしてノード情報をダンプ
    jsonExporter.parse(
      exportScene,
      (jsonResult: any) =>
      {
        console.group('🔍 Exported GLTF Node Rotations')
        const targetBones = ['hair_03_01', 'hair_03_02', 'skirt_01_01', 'skirt_01_02']
        jsonResult.nodes?.forEach((node: any, index: number) =>
        {
          if (targetBones.includes(node.name))
          {
            console.log(`Node ${index} (${node.name}):`, {
              rotation: node.rotation,
              translation: node.translation,
              scale: node.scale,
              matrix: node.matrix,
            })
          }
        })
        console.groupEnd()

        // SpringBone拡張の内容をダンプ
        console.group('🔍 Exported SpringBone Extension')
        const springBone = jsonResult.extensions?.VRMC_springBone
        if (springBone)
        {
          console.log('specVersion:', springBone.specVersion)
          console.log('springs count:', springBone.springs?.length)
          // 最初のspringの詳細
          if (springBone.springs?.[0])
          {
            const firstSpring = springBone.springs[0]
            console.log('First spring joints:', firstSpring.joints?.map((j: any) => ({
              node: j.node,
              nodeName: jsonResult.nodes?.[j.node]?.name,
              hasSettings: j.stiffness !== undefined,
            })))
          }
        } else
        {
          console.log('No VRMC_springBone extension')
        }
        console.groupEnd()
      },
      (error) => console.error('JSON export failed:', error),
      { binary: false, trs: true },
    )

    exporter.parse(
      exportScene,
      async (result) =>
      {
        // エクスポート後、子要素を元のvrm.sceneに戻す
        children.forEach((child) => vrm.scene.add(child))

        try
        {
          let blob: Blob
          if (result instanceof ArrayBuffer)
          {
            blob = new Blob([result], { type: 'application/octet-stream' })
          } else
          {
            const jsonString = JSON.stringify(result, null, 2)
            blob = new Blob([jsonString], { type: 'application/json' })
          }

          const file = new File([blob], `${vrm.scene.name || 'vrm-model'}.vrm`, {
            type: 'application/octet-stream',
          })

          const loadResult = await loadVRMFromFile(file)

          if (loadResult.isErr())
          {
            setError(`Reload failed: ${loadResult.error.message}`)
            setIsReloading(false)
            restoreSpringBone()
            return
          }

          // 再読み込み後の SpringBone 状態をキャプチャして比較
          const afterReloadSnapshot = captureSpringBoneSnapshot(loadResult.value, 'After Reload')
          compareSnapshots(afterResetSnapshot, afterReloadSnapshot)

          // 詳細な transform 情報をダンプ（デバッグ用）
          dumpProblematicBones(loadResult.value, 'After Reload')

          // リロード後のSpringBone設定を詳細ダンプ
          console.group('🔬 Reloaded SpringBone Settings')
          const reloadedManager = loadResult.value.springBoneManager
          if (reloadedManager)
          {
            let jointIndex = 0
            reloadedManager.joints.forEach((joint: any) =>
            {
              if (jointIndex < 6)
              {
                const childPos = joint.child?.position
                const initChildPos = joint._initialLocalChildPosition
                console.log(`Joint ${jointIndex}: ${joint.bone?.name}`, {
                  child: joint.child?.name || 'null',
                  childLocalPos: childPos ? `(${childPos.x.toFixed(4)}, ${childPos.y.toFixed(4)}, ${childPos.z.toFixed(4)})` : null,
                  _initialLocalChildPosition: initChildPos ? `(${initChildPos.x.toFixed(4)}, ${initChildPos.y.toFixed(4)}, ${initChildPos.z.toFixed(4)})` : null,
                })
              }
              jointIndex++
            })
          }
          console.groupEnd()

          setVRM(loadResult.value)
          setVRMAnimation(null)
          setIsReloading(false)
          restoreSpringBone()
        } catch (err)
        {
          setError(`Reload failed: ${String(err)}`)
          setIsReloading(false)
          restoreSpringBone()
        }
      },
      (error) =>
      {
        children.forEach((child) => vrm.scene.add(child))
        setError(`Export for reload failed: ${String(error)}`)
        setIsReloading(false)
        restoreSpringBone()
      },
      {
        binary: true,
        trs: false,
        onlyVisible: true,
      },
    )
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
          onReloadExport={handleReloadExport}
          isReloading={isReloading}
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
