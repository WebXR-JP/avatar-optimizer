/**
 * R3F の Canvas に渡すレンダラー設定（WebGL / WebGPU 共通）
 *
 * WebGPU のときは WebGPURenderer を生成して init() 完了を待ってから返す。
 * レンダラーとマテリアルの種類は起動時に決まり、途中で差し替えられないため、
 * 切り替えは renderer-mode.ts の switchRendererMode() でページを再読み込みする。
 *
 * 通常の 3D ビューポート（components/VRMCanvas.tsx）とストレステスト
 * （components/StressViewer.tsx）の双方から使う。
 */
import { WebGPURenderer } from 'three/webgpu'
import type { GLProps } from '@react-three/fiber'
import type { WebGLRenderer } from 'three'
import { setKtx2Renderer } from '@webxr-jp/avatar-optimizer'
import { rendererMode } from './renderer-mode'

export const CANVAS_GL_PROPS: GLProps = rendererMode === 'webgpu'
  ? async (props) =>
  {
    const renderer = new WebGPURenderer({
      // R3F の型は WebGL 前提で lib.dom と別定義の OffscreenCanvas を含むためキャストする
      canvas: props.canvas as HTMLCanvasElement,
      antialias: true,
      alpha: true,
    })
    await renderer.init()
    // KTX2 の対応形式を、一時 WebGLRenderer ではなく描画に使う WebGPURenderer で判定させる
    setKtx2Renderer(renderer)
    // R3F の Renderer 型は render() を持つことだけを要求する
    return renderer as unknown as WebGLRenderer
  }
  : {
    antialias: true,
    alpha: true,
  }

/** レンダラーが実際に使っているバックエンドの表示情報 */
export interface BackendInfo
{
  label: 'WebGL' | 'WebGPU'
  /** フォールバックが起きた理由。正常なら null */
  note: string | null
}

/**
 * レンダラーが実際に使っているバックエンドと、フォールバック時の補足を返す
 *
 * @param gl - R3F が保持するレンダラー（WebGLRenderer または WebGPURenderer）
 */
export function getBackendInfo(gl: unknown): BackendInfo
{
  const renderer = gl as { isWebGPURenderer?: boolean; backend?: { isWebGPUBackend?: boolean } }
  if (!renderer.isWebGPURenderer) return { label: 'WebGL', note: null }
  if (renderer.backend?.isWebGPUBackend) return { label: 'WebGPU', note: null }
  return {
    label: 'WebGL',
    note: 'WebGPU の初期化に失敗したため WebGL2 バックエンドで描画しています',
  }
}
