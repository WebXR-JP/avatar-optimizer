/**
 * 描画に使うレンダラー（WebGL / WebGPU）の選択
 *
 * レンダラーとマテリアルの種類（MToonMaterial / MToonNodeMaterial）は
 * 読み込み時点で決まり、途中で差し替えられない。そのため URL クエリ
 * `?renderer=webgpu` で起動時に一度だけ決め、切り替えはページの再読み込みで行う。
 *
 * WebGPU に対応していないブラウザで webgpu が指定された場合は WebGL に戻す。
 */

export type RendererMode = 'webgl' | 'webgpu'

/** 起動時のレンダラー決定結果 */
interface RendererModeResolution
{
  mode: RendererMode
  /** webgpu が要求されたが使えなかった理由。要求されていない・使用可能なら null */
  fallbackReason: string | null
}

const QUERY_KEY = 'renderer'

function isWebGPUAvailable(): boolean
{
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

/**
 * WebGPU が使えない理由を返す
 *
 * WebGPU は secure context でのみ公開されるため、LAN の IP や http の
 * ホスト名で開くと `navigator.gpu` 自体が存在しない。原因が分からないと
 * `?renderer=webgpu` を無視されたように見えるので、UI 表示用の文言も返す。
 */
function describeWebGPUUnavailable(): string
{
  if (typeof window !== 'undefined' && !window.isSecureContext)
  {
    return 'WebGPU は安全なコンテキストでのみ利用できます。localhost か https で開いてください'
  }
  return 'このブラウザは WebGPU に対応していません'
}

function resolveRendererMode(): RendererModeResolution
{
  if (typeof window === 'undefined') return { mode: 'webgl', fallbackReason: null }
  const requested = new URLSearchParams(window.location.search).get(QUERY_KEY)
  if (requested !== 'webgpu') return { mode: 'webgl', fallbackReason: null }
  if (!isWebGPUAvailable())
  {
    const fallbackReason = describeWebGPUUnavailable()
    console.warn(`[renderer-mode] ${fallbackReason}。WebGL で描画します`)
    return { mode: 'webgl', fallbackReason }
  }
  return { mode: 'webgpu', fallbackReason: null }
}

const resolution = resolveRendererMode()

/** 起動時に決まった描画レンダラー */
export const rendererMode: RendererMode = resolution.mode

/** webgpu を指定されたが WebGL にフォールバックした理由（フォールバックしていなければ null） */
export const rendererFallbackReason: string | null = resolution.fallbackReason

/**
 * レンダラーを切り替えてページを再読み込みする
 *
 * @param mode - 切り替え先のレンダラー
 */
export function switchRendererMode(mode: RendererMode): void
{
  const url = new URL(window.location.href)
  if (mode === 'webgpu')
  {
    url.searchParams.set(QUERY_KEY, 'webgpu')
  }
  else
  {
    url.searchParams.delete(QUERY_KEY)
  }
  window.location.assign(url.toString())
}
