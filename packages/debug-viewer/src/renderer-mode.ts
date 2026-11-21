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

const QUERY_KEY = 'renderer'

function isWebGPUAvailable(): boolean
{
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

function resolveRendererMode(): RendererMode
{
  if (typeof window === 'undefined') return 'webgl'
  const requested = new URLSearchParams(window.location.search).get(QUERY_KEY)
  if (requested !== 'webgpu') return 'webgl'
  if (!isWebGPUAvailable())
  {
    console.warn('[renderer-mode] WebGPU に対応していないため WebGL で描画します')
    return 'webgl'
  }
  return 'webgpu'
}

/** 起動時に決まった描画レンダラー */
export const rendererMode: RendererMode = resolveRendererMode()

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
