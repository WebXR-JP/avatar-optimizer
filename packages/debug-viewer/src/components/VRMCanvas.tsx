import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { VRM } from '@pixiv/three-vrm'
import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import type { PerspectiveCamera, WebGLRenderer, Texture } from 'three'
import VRMScene from './VRMScene'
import { MToonAtlasMaterial, type DebugMode } from '@webxr-jp/mtoon-atlas'
import type { AtlasGenerationOptions, SimplifyStatistics } from '@webxr-jp/avatar-optimizer'
import { useSpector } from '../hooks/useSpector'
import { useWebGLDebug } from '../hooks/useWebGLDebug'

import './VRMCanvas.css'


/**
 * Debug Mode ごとの説明文
 * Record<DebugMode, string> にしているのは、DebugMode が増えたときに
 * 説明文の追加漏れをコンパイルエラーで検出するため
 */
const DEBUG_MODE_HINTS: Record<DebugMode, string> = {
  none: '通常描画',
  uv: 'UV座標を可視化 (RG=UV)',
  normal: 'ワールド法線を可視化',
  shadow: 'シャドウ座標を可視化 (黄色=無効)',
  shadowValue: 'シャドウ値 (白=影なし、黒=影あり)',
  receiveShadow: 'receiveShadow (緑=有効、赤=無効)',
  lightDir: 'ライト方向を可視化',
  dotNL: '法線・ライト内積 (NdotL)',
  shading: 'MToonシェーディング結果',
  shadingParams: 'shadingShift(R)/shadingToony(G)/raw(B)',
  paramRaw: 'R=shadingShift, G=shadingToony, B=slot',
  litShadeRate: '明暗グラデーション',
  alpha: 'アルファ値 (R=最終, G=opacity, B=テクスチャ)',
}

/** アトラス解像度を設定できるスロット */
const ATLAS_SLOTS = [
  { key: 'default', label: 'Default' },
  { key: 'map', label: 'map' },
  { key: 'normalMap', label: 'normalMap' },
  { key: 'emissiveMap', label: 'emissiveMap' },
] as const

const ATLAS_RESOLUTIONS = [512, 1024, 2048, 4096] as const

type AtlasSlotKey = (typeof ATLAS_SLOTS)[number]['key']

/**
 * アトラス解像度オプションを更新した新しいオブジェクトを返す
 * 空文字（default）が選ばれたスロットはキーごと取り除く
 *
 * @param options - 現在のオプション
 * @param key - 更新するスロット（'default' は全体の既定値）
 * @param rawValue - select の値。'' は既定値に戻すことを表す
 */
function updateAtlasOption(
  options: AtlasGenerationOptions,
  key: AtlasSlotKey,
  rawValue: string,
): AtlasGenerationOptions
{
  if (key === 'default')
  {
    return { ...options, defaultResolution: Number(rawValue) }
  }

  const slotResolutions = { ...options.slotResolutions }
  if (rawValue === '')
  {
    delete slotResolutions[key]
  } else
  {
    slotResolutions[key] = Number(rawValue)
  }
  return { ...options, slotResolutions }
}

/**
 * サイドバーの折りたたみセクション
 * 見出しクリックで開閉する
 */
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
})
{
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="vrm-section">
      <button
        type="button"
        className="vrm-section__header"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="vrm-section__caret" aria-hidden="true">{open ? '▼' : '▶'}</span>
        {title}
      </button>
      {open && <div className="vrm-section__body">{children}</div>}
    </section>
  )
}

/**
 * VRM表情（モーフ）確認用セクション
 * expressionManagerから利用可能な表情一覧を取得し、スライダーで調整可能
 */
function ExpressionSection({ vrm }: { vrm: VRM })
{
  const [expressionValues, setExpressionValues] = useState<Record<string, number>>({})
  const expressionNames = useMemo(() =>
  {
    const manager = vrm.expressionManager
    if (!manager) return []
    // 登録されている全ての表情名を取得
    const names: string[] = []
    manager.expressions.forEach((expression) =>
    {
      names.push(expression.expressionName)
    })
    return names.sort()
  }, [vrm])

  // VRMが変わったら値をリセット
  useEffect(() =>
  {
    const initial: Record<string, number> = {}
    expressionNames.forEach((name) =>
    {
      initial[name] = vrm.expressionManager?.getValue(name) ?? 0
    })
    setExpressionValues(initial)
  }, [vrm, expressionNames])

  const handleExpressionChange = useCallback((name: string, value: number) =>
  {
    vrm.expressionManager?.setValue(name, value)
    setExpressionValues((prev) => ({ ...prev, [name]: value }))
  }, [vrm])

  const handleResetAll = useCallback(() =>
  {
    expressionNames.forEach((name) =>
    {
      vrm.expressionManager?.setValue(name, 0)
    })
    const reset: Record<string, number> = {}
    expressionNames.forEach((name) =>
    {
      reset[name] = 0
    })
    setExpressionValues(reset)
  }, [vrm, expressionNames])

  if (expressionNames.length === 0)
  {
    return null
  }

  return (
    <Section title={`表情 (${expressionNames.length})`}>
      <button className="vrm-btn" onClick={handleResetAll}>
        すべてリセット
      </button>
      <div className="vrm-expressions">
        {expressionNames.map((name) => (
          <div key={name} className="vrm-expression">
            <label className="vrm-expression__name" htmlFor={`expr-${name}`}>{name}</label>
            <input
              id={`expr-${name}`}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={expressionValues[name] ?? 0}
              onChange={(e) => handleExpressionChange(name, parseFloat(e.target.value))}
            />
            <span className="vrm-expression__value">
              {(expressionValues[name] ?? 0).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}

interface VRMCanvasProps
{
  vrm: VRM | null
  currentTab: number
  isLoading: boolean
  error: string | null
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onOptimize: () => Promise<void>
  isOptimizing: boolean
  onOptimizeOnly: () => Promise<void>
  onMigrateOnly: () => void
  onExportScene: () => void
  onExportGLTF: () => void
  onReplaceTextures: () => Promise<void>
  isReplacingTextures: boolean
  vrmAnimation: VRMAnimation | null
  onPlayAnimation: () => Promise<void>
  debugMode: DebugMode
  onDebugModeChange: (mode: DebugMode) => void
  springBoneEnabled: boolean
  onSpringBoneEnabledChange: (enabled: boolean) => void
  showBones: boolean
  onShowBonesChange: (show: boolean) => void
  showColliders: boolean
  onShowCollidersChange: (show: boolean) => void
  showPointLights: boolean
  onShowPointLightsChange: (show: boolean) => void
  logShaderInfo: boolean
  onLogShaderInfoChange: (log: boolean) => void
  onReloadExport: () => void
  isReloading: boolean
  atlasOptions: AtlasGenerationOptions
  onAtlasOptionsChange: (options: AtlasGenerationOptions) => void
  lastExportSize: number | null
  onSimplifyOnly: () => Promise<void>
  isSimplifying: boolean
  lastSimplifyStats: SimplifyStatistics | null
  defaultModels: { name: string; path: string }[]
  selectedModel: string
  onSelectModel: (path: string) => void
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
  onOptimizeOnly,
  onMigrateOnly,
  onExportScene,
  onExportGLTF,
  onReplaceTextures,
  isReplacingTextures,
  vrmAnimation,
  onPlayAnimation,
  debugMode,
  onDebugModeChange,
  springBoneEnabled,
  onSpringBoneEnabledChange,
  showBones,
  onShowBonesChange,
  showColliders,
  onShowCollidersChange,
  showPointLights,
  onShowPointLightsChange,
  logShaderInfo,
  onLogShaderInfoChange,
  onReloadExport,
  isReloading,
  atlasOptions,
  onAtlasOptionsChange,
  lastExportSize,
  onSimplifyOnly,
  isSimplifying,
  lastSimplifyStats,
  defaultModels,
  selectedModel,
  onSelectModel,
}: VRMCanvasProps)
{
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null)
  const [glRenderer, setGlRenderer] = useState<WebGLRenderer | null>(null)

  // Spector.js WebGLデバッグ（開発環境のみ）
  const { captureFrame, displayUI: displaySpectorUI, isReady: isSpectorReady } = useSpector(canvasElement)

  // WebGLデバッグユーティリティ
  const { dumpTexture, dumpFramebuffer, dumpWebGLInfo, listTextures } = useWebGLDebug(glRenderer)

  // テクスチャリストをコンソール出力
  const handleListTextures = useCallback(() => {
    if (vrm) {
      listTextures(vrm.scene)
    }
  }, [vrm, listTextures])

  // フレームバッファをコンソール出力
  const handleDumpFramebuffer = useCallback(() => {
    dumpFramebuffer('current-frame', 512)
  }, [dumpFramebuffer])

  // WebGL情報をコンソール出力
  const handleDumpWebGLInfo = useCallback(() => {
    dumpWebGLInfo()
  }, [dumpWebGLInfo])

  // 特定のテクスチャをダンプ（最初のbaseColorテクスチャ）
  const handleDumpFirstTexture = useCallback(() => {
    if (!vrm) return

    // 最初に見つかったmapテクスチャをダンプ
    vrm.scene.traverse((obj) => {
      const mesh = obj as { material?: { map?: Texture; name?: string } }
      if (mesh.material?.map) {
        dumpTexture(mesh.material.map, mesh.material.name || 'first-texture', 256)
        return
      }
    })
  }, [vrm, dumpTexture])

  const handleButtonClick = useCallback(() =>
  {
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="vrm-canvas">
      {/* 3D Viewport タブ以外では隠すだけにする。
          unmount するとセクションの開閉状態とスクロール位置が毎回リセットされる */}
      <aside className="vrm-sidebar" hidden={currentTab !== 0}>
        <h1 className="vrm-sidebar__title">VRM Debug Viewer</h1>

        <Section title="モデル" defaultOpen>
          <select
            className="vrm-field__select"
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value)}
            disabled={isLoading}
          >
            {defaultModels.map((model) => (
              <option key={model.path} value={model.path}>
                {model.name}
              </option>
            ))}
          </select>
          <button
            className="vrm-btn"
            onClick={handleButtonClick}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Upload VRM'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".vrm"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
        </Section>

        <Section title="最適化" defaultOpen>
          <button
            className="vrm-btn vrm-btn--primary"
            onClick={onOptimize}
            disabled={!vrm || isOptimizing}
          >
            {isOptimizing ? 'Optimizing...' : 'Optimize + Migrate'}
          </button>
          <div className="vrm-btn-row">
            <button
              className="vrm-btn vrm-btn--optimize"
              onClick={onOptimizeOnly}
              disabled={!vrm || isOptimizing}
            >
              Optimize
            </button>
            <button
              className="vrm-btn vrm-btn--migrate"
              onClick={onMigrateOnly}
              disabled={!vrm}
            >
              Migrate
            </button>
          </div>
          <button
            className="vrm-btn vrm-btn--simplify"
            onClick={onSimplifyOnly}
            disabled={!vrm || isSimplifying}
          >
            {isSimplifying ? 'Simplifying...' : 'Simplify Only'}
          </button>
          {lastSimplifyStats && (
            <dl className="vrm-stats">
              <dt>メッシュ</dt>
              <dd>
                {lastSimplifyStats.processedMeshCount} 処理
                <span className="vrm-stats__sub">
                  / {lastSimplifyStats.skippedMeshCount} スキップ
                </span>
              </dd>
              <dt>頂点</dt>
              <dd>
                {lastSimplifyStats.originalVertexCount.toLocaleString()} →{' '}
                {lastSimplifyStats.simplifiedVertexCount.toLocaleString()}
                <span className="vrm-stats__sub">
                  {' '}({(lastSimplifyStats.vertexReductionRatio * 100).toFixed(1)}% 削減)
                </span>
              </dd>
              <dt>インデックス</dt>
              <dd>
                {lastSimplifyStats.originalIndexCount.toLocaleString()} →{' '}
                {lastSimplifyStats.simplifiedIndexCount.toLocaleString()}
                <span className="vrm-stats__sub">
                  {' '}({(lastSimplifyStats.indexReductionRatio * 100).toFixed(1)}% 削減)
                </span>
              </dd>
            </dl>
          )}
        </Section>

        <Section title="エクスポート" defaultOpen>
          <button
            className="vrm-btn vrm-btn--export"
            onClick={onExportGLTF}
            disabled={!vrm}
          >
            Export VRM
          </button>
          <button
            className="vrm-btn"
            onClick={onReloadExport}
            disabled={!vrm || isReloading}
            title="エクスポート結果をファイルに出さずそのまま読み直す"
          >
            {isReloading ? 'Reloading...' : 'Reload Export'}
          </button>
          <button
            className="vrm-btn"
            onClick={onExportScene}
            disabled={!vrm}
          >
            Export Scene
          </button>
          {lastExportSize !== null && (
            <p className="vrm-note">
              Last export: <strong>{(lastExportSize / 1024 / 1024).toFixed(2)} MB</strong>
            </p>
          )}
        </Section>

        <Section title="表示設定">
          <label className="vrm-field vrm-field--stack">
            <span className="vrm-field__label">Debug Mode</span>
            <select
              className="vrm-field__select"
              value={debugMode}
              onChange={(e) => onDebugModeChange(e.target.value as DebugMode)}
            >
              {MToonAtlasMaterial.getAvailableDebugModes().map((mode) => (
                <option key={mode} value={mode}>
                  {mode === 'none' ? 'None (Normal)' : mode}
                </option>
              ))}
            </select>
          </label>
          {DEBUG_MODE_HINTS[debugMode] && (
            <p className="vrm-note">{DEBUG_MODE_HINTS[debugMode]}</p>
          )}
          <div className="vrm-checks">
            <label className="vrm-check">
              <input
                type="checkbox"
                checked={springBoneEnabled}
                onChange={(e) => onSpringBoneEnabledChange(e.target.checked)}
              />
              SpringBone
            </label>
            <label className="vrm-check">
              <input
                type="checkbox"
                checked={showBones}
                onChange={(e) => onShowBonesChange(e.target.checked)}
              />
              Show Bones
            </label>
            <label className="vrm-check">
              <input
                type="checkbox"
                checked={showColliders}
                onChange={(e) => onShowCollidersChange(e.target.checked)}
              />
              Show Colliders
            </label>
            <label className="vrm-check">
              <input
                type="checkbox"
                checked={showPointLights}
                onChange={(e) => onShowPointLightsChange(e.target.checked)}
              />
              Point Lights
            </label>
            <label className="vrm-check">
              <input
                type="checkbox"
                checked={logShaderInfo}
                onChange={(e) => onLogShaderInfoChange(e.target.checked)}
              />
              Log Shader
            </label>
          </div>
        </Section>

        <Section title="アトラス解像度">
          {ATLAS_SLOTS.map(({ key, label }) => (
            <label className="vrm-field" key={key}>
              <span className="vrm-field__label">{label}</span>
              <select
                className="vrm-field__select"
                value={
                  key === 'default'
                    ? atlasOptions.defaultResolution ?? 2048
                    : atlasOptions.slotResolutions?.[key] ?? ''
                }
                onChange={(e) => onAtlasOptionsChange(
                  updateAtlasOption(atlasOptions, key, e.target.value)
                )}
              >
                {key !== 'default' && <option value="">default</option>}
                {ATLAS_RESOLUTIONS.map((res) => (
                  <option key={res} value={res}>{res}</option>
                ))}
              </select>
            </label>
          ))}
        </Section>

        {vrm?.expressionManager && (
          <ExpressionSection key={vrm.scene.uuid} vrm={vrm} />
        )}

        <Section title="その他">
          <button
            className="vrm-btn"
            onClick={onReplaceTextures}
            disabled={!vrm || isReplacingTextures}
          >
            {isReplacingTextures ? 'Replacing...' : 'Replace Textures with UV'}
          </button>
          <button
            className="vrm-btn"
            onClick={onPlayAnimation}
            disabled={!vrm || !!vrmAnimation}
          >
            {vrmAnimation ? 'Playing Animation' : 'Play Animation'}
          </button>
        </Section>

        {(isSpectorReady || glRenderer) && (
          <Section title="WebGL ツール">
            {isSpectorReady && (
              <div className="vrm-btn-row">
                <button className="vrm-btn vrm-btn--tool" onClick={captureFrame} title="Spector.jsでフレームをキャプチャ">
                  Capture Frame
                </button>
                <button className="vrm-btn vrm-btn--tool" onClick={displaySpectorUI} title="Spector.js UIを表示">
                  Spector UI
                </button>
              </div>
            )}
            {glRenderer && (
              <div className="vrm-btn-grid">
                <button className="vrm-btn vrm-btn--tool" onClick={handleListTextures} title="テクスチャ一覧をコンソール出力">
                  List Tex
                </button>
                <button className="vrm-btn vrm-btn--tool" onClick={handleDumpFirstTexture} title="最初のテクスチャをBase64でコンソール出力">
                  Dump Tex
                </button>
                <button className="vrm-btn vrm-btn--tool" onClick={handleDumpFramebuffer} title="フレームバッファをBase64でコンソール出力">
                  Dump FB
                </button>
                <button className="vrm-btn vrm-btn--tool" onClick={handleDumpWebGLInfo} title="WebGL情報をコンソール出力">
                  GL Info
                </button>
              </div>
            )}
          </Section>
        )}
      </aside>

      <div className="vrm-canvas__viewport">
        <Canvas
          shadows
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
          onCreated={({ gl }) =>
          {
            gl.shadowMap.type = 2 // THREE.PCFSoftShadowMap
            setCanvasElement(gl.domElement)
            setGlRenderer(gl)
          }}
        >
          <CameraAspectUpdater />
          <VRMScene vrm={vrm} vrmAnimation={vrmAnimation} debugMode={debugMode} springBoneEnabled={springBoneEnabled} showBones={showBones} showColliders={showColliders} showPointLights={showPointLights} logShaderInfo={logShaderInfo} />
        </Canvas>

        {currentTab === 0 && error && (
          <div className="vrm-canvas__error">{error}</div>
        )}

        {currentTab === 0 && vrm && (
          <div className="vrm-canvas__status">
            VRM loaded: {vrm.scene.name || 'Unnamed Model'}
          </div>
        )}
      </div>
    </div>
  )
}

export default VRMCanvas
