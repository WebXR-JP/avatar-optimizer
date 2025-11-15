import type { VRM } from '@pixiv/three-vrm'
import type { Scene, PerspectiveCamera, WebGLRenderer } from 'three'

/**
 * VRM Viewer初期化オプション
 */
export interface VRMViewerOptions {
  /** コンテナDOM要素 */
  container: HTMLElement
  /** キャンバス幅（px） */
  width?: number
  /** キャンバス高さ（px） */
  height?: number
  /** マウスコントロール有効化（デフォルト: false） */
  enableControls?: boolean
}

/**
 * VRMビューアの内部状態
 */
export interface VRMViewerState {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  vrm: VRM | null
}

/**
 * VRMビューアエラー型
 */
export type ViewerError =
  | { type: 'CONTAINER_NOT_FOUND'; message: string }
  | { type: 'VRM_LOAD_FAILED'; message: string }
  | { type: 'RENDER_FAILED'; message: string }
  | { type: 'INVALID_OPTIONS'; message: string }
