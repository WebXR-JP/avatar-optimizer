/**
 * 描画性能の切り分け用プローブ（開発時のみ・`?perfprobe=1` で有効）
 *
 * VRM の読み込み後、条件を順に変えながら（影の有無・VRM の影・メッシュ単位の影など）
 * フレーム間隔・render() の CPU 時間・GPU 完了待ち時間を測る。測り終えたあとも
 * 5 秒ごとに状態を送り、時間経過や操作で遅くなるかを追う。
 * 送信先と記録内容は utils/perf-probe.ts を参照。
 */
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import type { VRM } from '@pixiv/three-vrm'
import type { Object3D } from 'three'
import { installDeviceCapture, postPerfLog, takePipelineCreations, type ProbeGPUDevice } from '../utils/perf-probe'

interface Stage
{
  name: string
  apply: () => void
  revert: () => void
}

/** WebGLRenderer / WebGPURenderer の共通部分のうち計測に使うもの */
type RendererLike = {
  render: (...args: unknown[]) => unknown
  setSize: (width: number, height: number, updateStyle?: boolean) => unknown
  info: {
    render: { calls?: number; drawCalls?: number; triangles: number }
    memory: { geometries: number; textures: number }
  }
  shadowMap: { enabled: boolean }
  getPixelRatio: () => number
  domElement: HTMLCanvasElement
  isWebGPURenderer?: boolean
  backend?: {
    isWebGPUBackend?: boolean
    device?: ProbeGPUDevice
  }
  _pipelines?: { caches?: Map<string, unknown> }
}

type MeshLike = Object3D & {
  isMesh?: boolean
  isSkinnedMesh?: boolean
  geometry: {
    attributes: { position: { count: number } }
    morphAttributes: { position?: unknown[] }
    index: { count: number } | null
  }
  material: MaterialLike | MaterialLike[]
}

type MaterialLike = { type: string; name: string; transparent: boolean; alphaTest: number; side: number; isOutline?: boolean }

/** 条件変更直後はパイプライン生成などが入るので捨てるフレーム数 */
const WARMUP_FRAMES = 2
const MIN_FRAMES = 3
const MIN_DURATION_MS = 500
const STAGE_TIMEOUT_MS = 30000
const MONITOR_INTERVAL_MS = 5000

function average(values: number[]): number
{
  if (values.length === 0) return 0
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10
}

function describeMesh(mesh: MeshLike)
{
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return {
    name: mesh.name,
    skinned: !!mesh.isSkinnedMesh,
    vertices: mesh.geometry.attributes.position.count,
    indices: mesh.geometry.index?.count ?? null,
    morphs: mesh.geometry.morphAttributes.position?.length ?? 0,
    materials: materials.map((material) => ({
      type: material.type,
      name: material.name,
      transparent: material.transparent,
      alphaTest: material.alphaTest,
      side: material.side,
      outline: !!material.isOutline,
    })),
  }
}

function sleep(ms: number): Promise<void>
{
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 条件ごとに描画時間を測って dev サーバーへ送るコンポーネント
 */
export function PerfProbe({ vrm }: { vrm: VRM | null })
{
  const gl = useThree((state) => state.gl)
  const startedRef = useRef(false)

  useEffect(() =>
  {
    if (!vrm || startedRef.current) return
    startedRef.current = true

    const renderer = gl as unknown as RendererLike
    const device = renderer.backend?.device
    if (device) installDeviceCapture(device)

    postPerfLog('env', {
      ua: navigator.userAgent,
      backend: renderer.isWebGPURenderer
        ? (renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2 fallback')
        : 'WebGL',
      dpr: window.devicePixelRatio,
      canvas: { width: renderer.domElement.width, height: renderer.domElement.height },
    })

    // setSize が繰り返し呼ばれていないか（描画バッファの作り直しが続いていないか）を記録する
    const originalSetSize = renderer.setSize.bind(renderer)
    let setSizeCalls = 0
    renderer.setSize = (width, height, updateStyle) =>
    {
      setSizeCalls++
      if (setSizeCalls <= 20)
      {
        postPerfLog('setSize', { width, height, pixelRatio: renderer.getPixelRatio() })
      }
      return originalSetSize(width, height, updateStyle)
    }

    // R3F が毎フレーム呼ぶ render() を包み、CPU 時間と GPU 完了待ちを測る
    const originalRender = renderer.render.bind(renderer)
    let frameTimes: number[] = []
    let cpuTimes: number[] = []
    let gpuTimes: number[] = []
    let lastFrameAt = 0
    renderer.render = (...args: unknown[]) =>
    {
      const start = performance.now()
      if (lastFrameAt > 0) frameTimes.push(start - lastFrameAt)
      lastFrameAt = start
      const result = originalRender(...args)
      const end = performance.now()
      cpuTimes.push(end - start)
      void device?.queue.onSubmittedWorkDone().then(() =>
      {
        gpuTimes.push(performance.now() - end)
      })
      return result
    }

    const resetSamples = () =>
    {
      frameTimes = []
      cpuTimes = []
      gpuTimes = []
      lastFrameAt = 0
      setSizeCalls = 0
    }

    const snapshot = () => ({
      frames: cpuTimes.length,
      avgIntervalMs: average(frameTimes),
      maxIntervalMs: Math.round(Math.max(0, ...frameTimes)),
      avgRenderCpuMs: average(cpuTimes),
      avgGpuDoneMs: device ? average(gpuTimes) : null,
      maxGpuDoneMs: device ? Math.round(Math.max(0, ...gpuTimes)) : null,
      calls: renderer.info.render.drawCalls ?? renderer.info.render.calls ?? 0,
      triangles: renderer.info.render.triangles,
      setSizeCalls,
      canvas: `${renderer.domElement.width}x${renderer.domElement.height}`,
      pipelines: renderer._pipelines?.caches?.size ?? null,
      pipelineCreations: takePipelineCreations(),
    })

    const vrmMeshes: MeshLike[] = []
    vrm.scene.traverse((object) =>
    {
      if ((object as MeshLike).isMesh) vrmMeshes.push(object as MeshLike)
    })
    postPerfLog('meshes', vrmMeshes.map(describeMesh))

    const setCast = (cast: boolean) =>
    {
      for (const mesh of vrmMeshes) mesh.castShadow = cast
    }

    const stages: Stage[] = [
      { name: 'baseline', apply: () => {}, revert: () => {} },
      {
        name: 'no-shadow',
        apply: () => { renderer.shadowMap.enabled = false },
        revert: () => { renderer.shadowMap.enabled = true },
      },
      {
        name: 'vrm-hidden',
        apply: () => { vrm.scene.visible = false },
        revert: () => { vrm.scene.visible = true },
      },
      {
        name: 'vrm-no-cast',
        apply: () => setCast(false),
        revert: () => setCast(true),
      },
      // VRM のメッシュ 1 つだけに影を落とさせ、どのメッシュの影描画が重いかを調べる
      ...vrmMeshes.map((mesh, index): Stage => ({
        name: `cast-only:${index}:${mesh.name}`,
        apply: () => { setCast(false); mesh.castShadow = true },
        revert: () => setCast(true),
      })),
    ]

    let cancelled = false

    const measureStage = async (stage: Stage) =>
    {
      stage.apply()
      const warmupUntil = cpuTimes.length + WARMUP_FRAMES
      while (cpuTimes.length < warmupUntil && !cancelled) await sleep(50)
      resetSamples()
      takePipelineCreations()
      const start = performance.now()
      while (!cancelled)
      {
        const elapsed = performance.now() - start
        if (cpuTimes.length >= MIN_FRAMES && elapsed >= MIN_DURATION_MS) break
        if (elapsed >= STAGE_TIMEOUT_MS) break
        await sleep(50)
      }
      const result = { stage: stage.name, ...snapshot() }
      stage.revert()
      return result
    }

    const run = async () =>
    {
      postPerfLog('start', { vrmMeshes: vrmMeshes.length, stages: stages.length })
      for (const stage of stages)
      {
        if (cancelled) return
        postPerfLog('stage', await measureStage(stage))
      }
      postPerfLog('done', null)

      while (!cancelled)
      {
        resetSamples()
        takePipelineCreations()
        await sleep(MONITOR_INTERVAL_MS)
        if (cancelled) return
        postPerfLog('monitor', {
          ...snapshot(),
          shadow: renderer.shadowMap.enabled,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          visibility: document.visibilityState,
          focus: document.hasFocus(),
        })
      }
    }
    void run()

    return () =>
    {
      cancelled = true
      // StrictMode の再マウントで計測をやり直せるようにする
      startedRef.current = false
      renderer.render = originalRender
      renderer.setSize = originalSetSize
    }
  }, [vrm, gl])

  return null
}
