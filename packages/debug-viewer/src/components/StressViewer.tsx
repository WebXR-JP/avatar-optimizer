/**
 * マルチ VRM ストレステスト（`/stress`）
 *
 * 数十体の VRM を同時に描画して、WebGL / WebGPU の描画性能・GPU メモリ・
 * テクスチャ数を比較するためのページ。通常のデバッグビューア（`/`）の
 * 「その他」セクションから開ける。
 *
 * 使い方:
 *   /stress?count=50&model=/AliciaSolid.vrm&renderer=webgpu&optimize=1
 *
 * クエリパラメータ:
 *   count      表示する VRM の数（既定 24 / 最大 100）
 *   model      使う VRM のパス（既定 /AliciaSolid.vrm）
 *   cols       グリッドの列数（省略時は count から自動）
 *   springbone 0 で SpringBone の更新を止める（既定は有効）
 *   shadows    1 で影を有効にする（既定は無効）
 *   dpr        描画の devicePixelRatio（例: 1）。省略時はディスプレイ依存
 *   optimize   1 で「Optimize + Migrate」を 1 回だけ実行し、その結果を
 *              全員分の読み込みに使い回す（既定は無効 = 生の VRM を表示）
 *   renderer   webgpu で WebGPU 描画（renderer-mode.ts と同じ）
 *
 * 計測値（左上）:
 *   fps / frame   実測のフレームレートとフレーム間隔。vsync で上限が付くため、
 *                 60fps に張り付いているときは CPU 時間（render の内訳）で比べる
 *   VRM update    three-vrm の更新（SpringBone・表情など）にかかった時間
 *   draw calls    WebGL は実測値。WebGPU は three r187 が記録しないため n/a
 *   triangles     WebGPU はメッシュの静的な合計（`(mesh)` 表示）
 *   textures      GPU に確保されたテクスチャ数（バックエンドの数え方の違いに注意）
 *
 * 設計メモ:
 *   - 最適化は「生の VRM を 1 回だけ最適化 + エクスポートし、そのバイナリを
 *     全員分の読み込みに使い回す」方式（optimizedRef）。体数を変えても再実行しない
 *   - アップロードしたカスタム VRM は IndexedDB に直近 1 件だけ保存し、
 *     再読み込み・レンダラー切替の後も復元する（utils/custom-vrm-store.ts）
 *   - レンダラーとマテリアルの種類は起動時に決まる（renderer-mode.ts）
 *   - 開発時は window.__stressViewer から renderer / scene / count() を参照できる
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Mesh, Object3D } from 'three'
import { VRMUtils, type VRM } from '@pixiv/three-vrm'
import { exportVRM, optimizeModel, type SkeletonOptimizationStatistics } from '@webxr-jp/avatar-optimizer'
import { MToonAtlasNodeMaterial } from '@webxr-jp/mtoon-atlas/nodes'
import { loadVRM } from '../hooks'
import { CANVAS_GL_PROPS, getBackendInfo, type BackendInfo } from '../canvas-gl-props'
import { CameraAspectUpdater } from './CameraAspectUpdater'
import { rendererMode, switchRendererMode, type RendererMode } from '../renderer-mode'
import { clearCustomVRM, loadCustomVRM, saveCustomVRM, type StoredCustomVRM } from '../utils/custom-vrm-store'
import './StressViewer.css'

const MODEL_OPTIONS = [
  { name: 'AliciaSolid', path: '/AliciaSolid.vrm' },
  { name: 'AliciaSolid (COLOR_0)', path: '/AliciaSolid_COLOR0.vrm' },
  { name: 'Vivi', path: '/Vivi.vrm' },
  { name: 'Vita', path: '/Vita.vrm' },
]

/** モデル select でアップロード済みファイルを表す値 */
const CUSTOM_MODEL_VALUE = '__custom__'

const DEFAULT_COUNT = 24
const MAX_COUNT = 100
/** 同時にパースする VRM の数。増やすとメモリ・ロード時間が跳ね上がる */
const LOAD_CONCURRENCY = 4

/** 最適化（アトラス化）の解像度。通常ビューアの既定値に合わせる */
const ATLAS_OPTIONS = { defaultResolution: 2048 }

// WebGPU では TSL 版のアトラスマテリアルに統合する（通常ビューアと同じ）
const ATLAS_MATERIAL_TYPE = rendererMode === 'webgpu' ? MToonAtlasNodeMaterial : undefined

/** 最適化 1 回分の結果（モデルごとに使い回す） */
interface OptimizedModel
{
  key: string
  /** 最適化・エクスポート済みの VRM バイナリ */
  buffer: ArrayBuffer
  /** 最適化 + エクスポートにかかった時間 (ms) */
  elapsedMs: number
  /** エクスポートした VRM のサイズ (byte) */
  size: number
  originalMaterialCount: number
  reducedDrawCalls: number
  atlasSkipped: string | null
  /** スケルトン統合・未使用ボーン除去の結果（未実行なら null） */
  skeleton: SkeletonOptimizationStatistics | null
}

/** VRM 1 体分のグリッド間隔（メートル） */
const SPACING_X = 1.4
const SPACING_Z = 1.35

interface LoadedVRM
{
  id: string
  vrm: VRM
}

interface GridLayout
{
  cols: number
  rows: number
  width: number
  depth: number
}

/**
 * count 体を並べるグリッドの寸法を返す
 *
 * @param total - VRM の数
 * @param cols - 列数の指定。null なら正方形に近くなるよう自動決定
 */
function computeLayout(total: number, cols: number | null): GridLayout
{
  const columnCount = Math.max(1, Math.min(cols ?? Math.ceil(Math.sqrt(total)), total))
  const rowCount = Math.ceil(total / columnCount)
  return {
    cols: columnCount,
    rows: rowCount,
    width: (columnCount - 1) * SPACING_X,
    depth: (rowCount - 1) * SPACING_Z,
  }
}

/**
 * index 番目の VRM を置く位置を返す（グリッドの中心が原点）
 */
function positionFor(index: number, layout: GridLayout): [number, number, number]
{
  const col = index % layout.cols
  const row = Math.floor(index / layout.cols)
  return [
    col * SPACING_X - layout.width / 2,
    0,
    row * SPACING_Z - layout.depth / 2,
  ]
}

/**
 * シーン内のメッシュの三角形数を合計する
 *
 * WebGPU のレンダラーは info.render.triangles を数えないため、
 * その場合の表示に使う（影のパスやカリングは反映されない静的な値）
 */
function countSceneTriangles(items: LoadedVRM[]): number
{
  let triangles = 0
  for (const { vrm } of items)
  {
    vrm.scene.traverse((object: Object3D) =>
    {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      const geometry = mesh.geometry
      const count = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0
      triangles += count / 3
    })
  }
  return Math.round(triangles)
}

function readInt(params: URLSearchParams, key: string, fallback: number, min: number, max: number): number
{
  const raw = params.get(key)
  if (raw === null) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

/** 集計中の値。HUD が 0.5 秒ごとに読んでリセットする */
interface StatsAccumulator
{
  frames: number
  updateMs: number
  lastSampleAt: number
}

interface StatsSample
{
  fps: number
  frameMs: number
  updateMs: number
  calls: number
  triangles: number
  textures: number
  geometries: number
  dpr: number
}

interface RendererInfoLike
{
  info: {
    render: { calls?: number; drawCalls?: number; triangles: number }
    memory: { geometries: number; textures: number }
  }
  getPixelRatio: () => number
}

interface StressSceneProps
{
  vrms: LoadedVRM[]
  layout: GridLayout
  springBoneEnabled: boolean
  shadowsEnabled: boolean
  resetToken: number
  statsRef: React.MutableRefObject<StatsAccumulator>
}

function StressScene({
  vrms,
  layout,
  springBoneEnabled,
  shadowsEnabled,
  resetToken,
  statsRef,
}: StressSceneProps)
{
  const { scene, camera, controls } = useThree()
  const extent = Math.max(layout.width, layout.depth, SPACING_X)
  const floorSize = extent + 12
  const shadowExtent = extent / 2 + 2

  // VRM のシーンを追加・削除する。vrms は読み込み完了ごとに増えるので、
  // 追加のたびに全員を add し直す（Scene への add は同じオブジェクトなら実害がない）
  useEffect(() =>
  {
    const scenes = vrms.map((item) => item.vrm.scene)
    for (const object of scenes) scene.add(object)
    return () =>
    {
      for (const object of scenes) scene.remove(object)
    }
  }, [vrms, scene])

  // グリッド全体が入る位置にカメラを置く。後列が前列に隠れないよう少し見下ろす
  useEffect(() =>
  {
    const distance = Math.max(4.5, extent + 3)
    camera.position.set(0, Math.max(1.8, layout.depth * 0.8 + 1.4), distance)
    camera.lookAt(0, 1, 0)
    const orbit = controls as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null
    if (orbit)
    {
      orbit.target.set(0, 1, 0)
      orbit.update()
    }
  }, [camera, controls, extent, layout.depth, resetToken])

  useFrame((_state, delta) =>
  {
    const accumulator = statsRef.current
    accumulator.frames++

    const dt = Math.min(delta, 0.05)
    const startedAt = performance.now()
    for (const { vrm } of vrms)
    {
      if (springBoneEnabled)
      {
        vrm.update(dt)
      }
      else
      {
        vrm.humanoid?.update()
        vrm.nodeConstraintManager?.update()
        vrm.expressionManager?.update()
        vrm.lookAt?.update(dt)
      }
    }
    accumulator.updateMs += performance.now() - startedAt
  })

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 8, 6]}
        intensity={2.2}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={extent * 2 + 20}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.0005}
      />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color="#bbbbbb" roughness={0.9} metalness={0.05} />
      </mesh>
      <gridHelper args={[extent + 8, Math.max(8, Math.round((extent + 8) / 1.4)), 0x444444, 0x333333]} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} target={[0, 1, 0]} />
    </>
  )
}

/** 左上に出す計測値 */
function StatsOverlay({ statsRef, glRef, vrmCount, meshTriangles }: {
  statsRef: React.MutableRefObject<StatsAccumulator>
  glRef: React.MutableRefObject<RendererInfoLike | null>
  vrmCount: number
  meshTriangles: number
})
{
  const [sample, setSample] = useState<StatsSample | null>(null)

  useEffect(() =>
  {
    const id = window.setInterval(() =>
    {
      const accumulator = statsRef.current
      const now = performance.now()
      const elapsed = now - accumulator.lastSampleAt
      if (accumulator.frames === 0 || elapsed <= 0)
      {
        accumulator.lastSampleAt = now
        return
      }

      const renderer = glRef.current
      const info = renderer?.info
      setSample({
        fps: (accumulator.frames * 1000) / elapsed,
        frameMs: elapsed / accumulator.frames,
        updateMs: accumulator.updateMs / accumulator.frames,
        // three r187 は WebGL では info.render.calls、WebGPU では
        // info.render.drawCalls に「今フレームの描画回数」を持つ。
        // WebGPU の calls は render() の累計、drawCalls は未実装（常に 0）
        calls: rendererMode === 'webgpu'
          ? (info?.render.drawCalls ?? 0)
          : (info?.render.calls ?? 0),
        triangles: info?.render.triangles ?? 0,
        textures: info?.memory.textures ?? 0,
        geometries: info?.memory.geometries ?? 0,
        dpr: renderer?.getPixelRatio() ?? window.devicePixelRatio,
      })

      accumulator.frames = 0
      accumulator.updateMs = 0
      accumulator.lastSampleAt = now
    }, 500)
    return () => window.clearInterval(id)
  }, [statsRef, glRef])

  return (
    <div className="stress-stats">
      <div className="stress-stats__fps">
        {sample ? `${sample.fps.toFixed(1)} fps` : '計測中...'}
      </div>
      <dl>
        <dt>frame</dt>
        <dd>{sample ? `${sample.frameMs.toFixed(2)} ms` : '-'}</dd>
        <dt>VRM update</dt>
        <dd>{sample ? `${sample.updateMs.toFixed(2)} ms` : '-'}</dd>
        <dt>draw calls</dt>
        <dd>{sample ? (sample.calls > 0 ? sample.calls.toLocaleString() : 'n/a') : '-'}</dd>
        <dt>triangles</dt>
        <dd>
          {sample
            ? (sample.triangles > 0
              ? sample.triangles.toLocaleString()
              : `${meshTriangles.toLocaleString()} (mesh)`)
            : '-'}
        </dd>
        <dt>textures</dt>
        <dd>{sample ? sample.textures.toLocaleString() : '-'}</dd>
        <dt>geometries</dt>
        <dd>{sample ? sample.geometries.toLocaleString() : '-'}</dd>
        <dt>dpr</dt>
        <dd>{sample ? sample.dpr.toFixed(2) : '-'}</dd>
        <dt>VRM</dt>
        <dd>{vrmCount}</dd>
      </dl>
    </div>
  )
}

/**
 * ストレステストページ本体（Canvas・ロード・操作パネルを持つ）
 */
export function StressViewer()
{
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const [count, setCount] = useState(() => readInt(params, 'count', DEFAULT_COUNT, 1, MAX_COUNT))
  const [countDraft, setCountDraft] = useState(String(count))
  const [modelPath, setModelPath] = useState(() =>
  {
    const requested = params.get('model')
    return MODEL_OPTIONS.some((option) => option.path === requested) ? requested! : MODEL_OPTIONS[0].path
  })
  const cols = useMemo(() =>
  {
    const raw = params.get('cols')
    if (raw === null) return null
    const value = Number.parseInt(raw, 10)
    return Number.isFinite(value) && value > 0 ? value : null
  }, [params])
  const [springBoneEnabled, setSpringBoneEnabled] = useState(params.get('springbone') !== '0')
  const [shadowsEnabled, setShadowsEnabled] = useState(params.get('shadows') === '1')
  const [optimizeEnabled, setOptimizeEnabled] = useState(params.get('optimize') === '1')
  const [phase, setPhase] = useState<'idle' | 'optimizing' | 'exporting' | 'loading'>('idle')
  const [optimizeInfo, setOptimizeInfo] = useState<OptimizedModel | null>(null)
  const [optimizeCached, setOptimizeCached] = useState(false)
  // アップロードされたカスタム VRM（IndexedDB から復元したものも含む）
  const [customSource, setCustomSource] = useState<StoredCustomVRM | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const dpr = useMemo(() =>
  {
    const raw = params.get('dpr')
    if (raw === null) return undefined
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? Math.max(0.5, Math.min(3, value)) : undefined
  }, [params])

  const [vrms, setVrms] = useState<LoadedVRM[]>([])
  const [progress, setProgress] = useState({ loaded: 0, total: 0 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backend, setBackend] = useState<BackendInfo | null>(null)
  const [gpuName, setGpuName] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState(0)

  const allRef = useRef<LoadedVRM[]>([])
  const glRef = useRef<RendererInfoLike | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const statsRef = useRef<StatsAccumulator>({ frames: 0, updateMs: 0, lastSampleAt: performance.now() })
  // 最適化結果のキャッシュ。体数を変えても再最適化しないため保持する
  const optimizedRef = useRef<OptimizedModel | null>(null)

  const layout = useMemo(() => computeLayout(count, cols), [count, cols])
  const meshTriangles = useMemo(() => countSceneTriangles(vrms), [vrms])

  const updateUrl = useCallback((updates: Record<string, string | null>) =>
  {
    const url = new URL(window.location.href)
    for (const [key, value] of Object.entries(updates))
    {
      if (value === null) url.searchParams.delete(key)
      else url.searchParams.set(key, value)
    }
    window.history.replaceState(null, '', url.toString())
  }, [])

  // 保存済みのカスタム VRM を復元する（レンダラー切替時の再読み込み対策）
  useEffect(() =>
  {
    let cancelled = false
    void loadCustomVRM()
      .then((stored) =>
      {
        if (cancelled) return
        if (stored)
        {
          setCustomSource(stored)
          updateUrl({ model: null })
        }
        setIsRestoring(false)
      })
      .catch(() =>
      {
        if (!cancelled) setIsRestoring(false)
      })
    return () =>
    {
      cancelled = true
    }
  }, [updateUrl])

  const disposeAll = useCallback(() =>
  {
    for (const item of allRef.current)
    {
      item.vrm.scene.removeFromParent()
      VRMUtils.deepDispose(item.vrm.scene)
    }
    allRef.current = []
    setVrms([])
  }, [])

  // VRM を count 体読み込む。読み込み途中で count が変わったら結果は破棄する。
  // optimizeEnabled のときは「生の VRM を 1 回だけ最適化 + エクスポート」し、
  // そのバイナリを全員分の読み込みに使い回す（体数を変えても再最適化しない）
  useEffect(() =>
  {
    // IndexedDB からのカスタム VRM 復元が終わるまで読み込みを始めない
    if (isRestoring) return

    let cancelled = false
    let nextIndex = 0
    let loaded = 0

    const source: string | ArrayBuffer = customSource ? customSource.buffer : modelPath
    const sourceKey = customSource
      ? `custom:${customSource.name}:${customSource.size}:${customSource.lastModified}`
      : `builtin:${modelPath}`

    disposeAll()
    statsRef.current.frames = 0
    statsRef.current.updateMs = 0
    statsRef.current.lastSampleAt = performance.now()

    setError(null)
    setProgress({ loaded: 0, total: count })
    setIsLoading(count > 0)
    setPhase('idle')

    const total = count
    const currentLayout = computeLayout(total, cols)

    const worker = async (source: string | ArrayBuffer) =>
    {
      while (!cancelled)
      {
        const index = nextIndex++
        if (index >= total) return

        const result = await loadVRM(source)

        if (cancelled)
        {
          // 破棄済みのロード結果はここで解放する
          if (result.isOk()) VRMUtils.deepDispose(result.value.scene)
          return
        }

        if (result.isErr())
        {
          setError(result.error.message)
          setIsLoading(false)
          setPhase('idle')
          return
        }

        const vrm = result.value
        const [x, , z] = positionFor(index, currentLayout)
        vrm.scene.position.set(x, 0, z)
        // 生の VRM 0.x は -Z、マイグレーション後の VRM 1.0 は +Z が正面
        const isVRM1 = (vrm.meta as { metaVersion?: string } | undefined)?.metaVersion === '1'
        vrm.scene.rotation.y = isVRM1 ? 0 : Math.PI
        vrm.scene.traverse((object: Object3D) =>
        {
          if ((object as Mesh).isMesh) object.castShadow = true
        })

        allRef.current.push({ id: vrm.scene.uuid, vrm })
        loaded++
        setVrms([...allRef.current])
        setProgress({ loaded, total })
        if (loaded >= total)
        {
          setIsLoading(false)
          setPhase('idle')
        }
      }
    }

    /**
     * モデルを 1 回だけ最適化 + エクスポートする（キャッシュがあれば使う）
     */
    const prepareSource = async (): Promise<string | ArrayBuffer | null> =>
    {
      if (!optimizeEnabled) return source

      const key = `${sourceKey}|${rendererMode}|${ATLAS_OPTIONS.defaultResolution}`
      const cached = optimizedRef.current
      if (cached?.key === key)
      {
        setOptimizeInfo(cached)
        setOptimizeCached(true)
        return cached.buffer
      }

      const startedAt = performance.now()
      setOptimizeInfo(null)
      setOptimizeCached(false)

      setPhase('optimizing')
      const loadResult = await loadVRM(source)
      if (cancelled)
      {
        if (loadResult.isOk()) VRMUtils.deepDispose(loadResult.value.scene)
        return null
      }
      if (loadResult.isErr())
      {
        setError(loadResult.error.message)
        setIsLoading(false)
        setPhase('idle')
        return null
      }
      const sourceVrm = loadResult.value

      const optimizeResult = await optimizeModel(sourceVrm, {
        migrateVRM0ToVRM1: true,
        atlas: ATLAS_OPTIONS,
        atlasMaterialType: ATLAS_MATERIAL_TYPE,
      })
      if (optimizeResult.isErr())
      {
        VRMUtils.deepDispose(sourceVrm.scene)
        setError(`Optimize failed (${optimizeResult.error.type}): ${optimizeResult.error.message}`)
        setIsLoading(false)
        setPhase('idle')
        return null
      }

      const stats = optimizeResult.value
      console.info('[stress] optimize:', stats.statistics, stats.atlasSkipped ?? null)

      setPhase('exporting')
      const exportResult = await exportVRM(sourceVrm, {
        textureCompression: { supercompression: true },
      })
      // 最適化済みの VRM はエクスポートにしか使わないのでここで解放する
      VRMUtils.deepDispose(sourceVrm.scene)

      if (cancelled) return null
      if (exportResult.isErr())
      {
        setError(`Export failed (${exportResult.error.type}): ${exportResult.error.message}`)
        setIsLoading(false)
        setPhase('idle')
        return null
      }

      const optimized: OptimizedModel = {
        key,
        buffer: exportResult.value,
        elapsedMs: performance.now() - startedAt,
        size: exportResult.value.byteLength,
        originalMaterialCount: stats.statistics.originalMaterialCount,
        reducedDrawCalls: stats.statistics.reducedDrawCalls,
        atlasSkipped: stats.atlasSkipped?.message ?? null,
        skeleton: stats.statistics.skeleton ?? null,
      }
      optimizedRef.current = optimized
      setOptimizeInfo(optimized)
      return optimized.buffer
    }

    const run = async () =>
    {
      const source = await prepareSource()
      if (cancelled || source === null) return

      setPhase('loading')
      await Promise.all(
        Array.from({ length: Math.min(LOAD_CONCURRENCY, total) }, () => worker(source)),
      )
    }

    void run()

    return () =>
    {
      cancelled = true
    }
  }, [count, cols, customSource, modelPath, optimizeEnabled, isRestoring, disposeAll])

  // ページを離れるときに VRM を解放する
  useEffect(() => disposeAll, [disposeAll])

  // WebGPU の GPU 名を表示する（取れなくても致命的ではない）
  useEffect(() =>
  {
    const gpu = (navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<{
          info?: { vendor?: string; architecture?: string; device?: string; description?: string }
        } | null>
      }
    }).gpu
    if (!gpu) return
    let cancelled = false
    void gpu.requestAdapter().then((adapter) =>
    {
      if (cancelled || !adapter?.info) return
      const info = adapter.info
      const name = [info.vendor, info.architecture, info.device, info.description]
        .filter(Boolean)
        .join(' ')
      if (name) setGpuName(name)
    }).catch(() => {})
    return () =>
    {
      cancelled = true
    }
  }, [])

  const applyCount = useCallback(() =>
  {
    const next = Math.max(1, Math.min(MAX_COUNT, Number.parseInt(countDraft, 10) || DEFAULT_COUNT))
    setCountDraft(String(next))
    setCount(next)
    updateUrl({ count: String(next) })
  }, [countDraft, updateUrl])

  const handleUploadClick = useCallback(() =>
  {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) =>
  {
    const file = event.target.files?.[0]
    // 同じファイルを選び直しても change が発火するようにリセットする
    event.target.value = ''
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.vrm'))
    {
      setError('VRM ファイル (.vrm) を選択してください')
      return
    }

    setIsUploading(true)
    setError(null)
    try
    {
      const buffer = await file.arrayBuffer()
      const stored: StoredCustomVRM = {
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        buffer,
      }
      setCustomSource(stored)
      updateUrl({ model: null })
      // 保存に失敗しても表示自体は続けられるので警告だけ出す
      void saveCustomVRM(stored).then((saved) =>
      {
        if (!saved) console.warn('[stress] カスタム VRM をブラウザに保存できませんでした')
      })
    }
    catch (err)
    {
      setError(`ファイルの読み込みに失敗しました: ${String(err)}`)
    }
    finally
    {
      setIsUploading(false)
    }
  }, [updateUrl])

  const handleClearCustom = useCallback(() =>
  {
    setCustomSource(null)
    void clearCustomVRM()
  }, [])

  const handleModelChange = useCallback((value: string) =>
  {
    if (value === CUSTOM_MODEL_VALUE) return
    setModelPath(value)
    updateUrl({ model: value })
    // 組み込みモデルに切り替えたらカスタムは解除し、保存分も消す
    if (customSource)
    {
      setCustomSource(null)
      void clearCustomVRM()
    }
  }, [customSource, updateUrl])

  const progressPercent = progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0

  return (
    <div className="stress-root">
      <Canvas
        shadows={shadowsEnabled ? 'percentage' : false}
        dpr={dpr}
        camera={{
          position: [0, 3, 9],
          fov: 45,
          near: 0.1,
          far: 300,
        }}
        gl={CANVAS_GL_PROPS}
        onCreated={({ gl, scene, camera, size }) =>
        {
          if (rendererMode === 'webgpu') gl.setSize(size.width, size.height)
          glRef.current = gl as unknown as RendererInfoLike
          setBackend(getBackendInfo(gl))
          // ブラウザ自動操作から状態を取れるようにしておく
          if (import.meta.env.DEV)
          {
            (window as unknown as { __stressViewer?: unknown }).__stressViewer = {
              renderer: gl,
              scene,
              camera,
              vrms: () => allRef.current.map((item) => item.vrm.scene.uuid),
              count: () => allRef.current.length,
            }
          }
        }}
      >
        <CameraAspectUpdater />
        <StressScene
          vrms={vrms}
          layout={layout}
          springBoneEnabled={springBoneEnabled}
          shadowsEnabled={shadowsEnabled}
          resetToken={resetToken}
          statsRef={statsRef}
        />
      </Canvas>

      <StatsOverlay
        statsRef={statsRef}
        glRef={glRef}
        vrmCount={vrms.length}
        meshTriangles={meshTriangles}
      />

      <div className="stress-panel">
        <div className="stress-panel__title">Multi-VRM Stress Test</div>
        <div className="stress-panel__row">
          <span>Renderer</span>
          <select
            value={rendererMode}
            onChange={(event) => switchRendererMode(event.target.value as RendererMode)}
          >
            <option value="webgl">WebGL</option>
            <option value="webgpu">WebGPU</option>
          </select>
        </div>
        <div className="stress-panel__row">
          <span>Backend</span>
          <strong data-testid="stress-backend">{backend?.label ?? '-'}</strong>
        </div>
        {backend?.note && <p className="stress-panel__note">{backend.note}</p>}
        {gpuName && <p className="stress-panel__note">GPU: {gpuName}</p>}

        <div className="stress-panel__row">
          <span>Model</span>
          <select
            value={customSource ? CUSTOM_MODEL_VALUE : modelPath}
            onChange={(event) => handleModelChange(event.target.value)}
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.path} value={option.path}>{option.name}</option>
            ))}
            {customSource && (
              <option value={CUSTOM_MODEL_VALUE}>カスタム: {customSource.name}</option>
            )}
          </select>
        </div>
        <div className="stress-panel__row">
          <button type="button" onClick={handleUploadClick} disabled={isUploading}>
            {isUploading ? 'Uploading...' : 'Upload VRM'}
          </button>
          {customSource && (
            <button type="button" onClick={handleClearCustom}>
              Clear custom
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".vrm"
          data-testid="stress-upload"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {customSource && (
          <p className="stress-panel__note" data-testid="stress-custom-name">
            カスタム: {customSource.name}（{(customSource.size / 1024 / 1024).toFixed(1)} MB）
            ブラウザ内に保存され、再読み込み・レンダラー切替後も復元されます。
          </p>
        )}

        <div className="stress-panel__row">
          <span>Count</span>
          <input
            type="number"
            min={1}
            max={MAX_COUNT}
            value={countDraft}
            onChange={(event) => setCountDraft(event.target.value)}
            onKeyDown={(event) =>
            {
              if (event.key === 'Enter') applyCount()
            }}
          />
          <button type="button" onClick={applyCount}>Apply</button>
        </div>

        <label className="stress-panel__check">
          <input
            type="checkbox"
            checked={springBoneEnabled}
            onChange={(event) =>
            {
              setSpringBoneEnabled(event.target.checked)
              updateUrl({ springbone: event.target.checked ? null : '0' })
            }}
          />
          SpringBone
        </label>
        <label className="stress-panel__check">
          <input
            type="checkbox"
            checked={shadowsEnabled}
            onChange={(event) =>
            {
              setShadowsEnabled(event.target.checked)
              updateUrl({ shadows: event.target.checked ? '1' : null })
            }}
          />
          Shadows
        </label>
        <label className="stress-panel__check">
          <input
            type="checkbox"
            checked={optimizeEnabled}
            onChange={(event) =>
            {
              setOptimizeEnabled(event.target.checked)
              updateUrl({ optimize: event.target.checked ? '1' : null })
            }}
          />
          Optimize (once)
        </label>

        <div className="stress-panel__row">
          <button type="button" onClick={() => setResetToken((value) => value + 1)}>
            Reset Camera
          </button>
          <a href="/">Back to viewer</a>
        </div>

        <div className="stress-panel__progress">
          <div className="stress-panel__progress-bar">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <span>
            {isRestoring
              ? '準備中...'
              : phase === 'optimizing'
                ? 'Optimizing (1回のみ)...'
                : phase === 'exporting'
                  ? 'Exporting optimized VRM...'
                  : `${isLoading ? 'Loading' : 'Loaded'} ${progress.loaded} / ${progress.total}`}
          </span>
        </div>
        {optimizeEnabled && optimizeInfo && (
          <p className="stress-panel__note" data-testid="stress-optimize-info">
            Optimize: {optimizeCached ? 'cached' : `${(optimizeInfo.elapsedMs / 1000).toFixed(1)} s`}
            {' / '}{(optimizeInfo.size / 1024 / 1024).toFixed(2)} MB
            {' / materials '}{optimizeInfo.originalMaterialCount}
            {optimizeInfo.reducedDrawCalls > 0 ? ` / draw calls -${optimizeInfo.reducedDrawCalls}` : ''}
          </p>
        )}
        {optimizeEnabled && optimizeInfo?.skeleton && (
          <p className="stress-panel__note" data-testid="stress-skeleton-info">
            Skeletons: {optimizeInfo.skeleton.originalSkeletonCount} → {optimizeInfo.skeleton.optimizedSkeletonCount}
            {' / bones '}{optimizeInfo.skeleton.originalTotalBones.toLocaleString()} → {optimizeInfo.skeleton.optimizedTotalBones.toLocaleString()}
          </p>
        )}
        {optimizeEnabled && optimizeInfo?.atlasSkipped && (
          <p className="stress-panel__error">atlas skipped: {optimizeInfo.atlasSkipped}</p>
        )}
        {optimizeEnabled && (
          <p className="stress-panel__note">
            最適化はモデルごとに 1 回だけ実行し、その結果を全員分の読み込みに使い回します。
          </p>
        )}
        {error && <p className="stress-panel__error">{error}</p>}
        <p className="stress-panel__note">
          メモリ使用量に注意。モデルを増やしすぎると GPU メモリ不足で描画が止まります。
        </p>
        {rendererMode === 'webgpu' && (
          <p className="stress-panel__note">
            WebGPU では three r187 が draw call 数を記録しないため n/a 表示になります。
          </p>
        )}
      </div>
    </div>
  )
}
