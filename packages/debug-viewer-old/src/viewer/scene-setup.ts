import * as THREE from 'three'
import type { VRMViewerOptions, VRMViewerState } from '../types'

/**
 * Three.jsシーンをセットアップします。
 * カメラ、レンダラー、ライティングを初期化します。
 *
 * @param options - ビューアオプション
 * @returns ビューア状態オブジェクト
 */
export function setupScene(options: VRMViewerOptions): VRMViewerState {
  const { container, width = 800, height = 600 } = options

  // シーン作成
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x212121)

  // カメラ作成
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(0, 1.5, 3)
  camera.lookAt(0, 1, 0)

  // レンダラー作成
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(typeof window !== 'undefined' ? window.devicePixelRatio : 1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1

  // DOMに追加
  container.appendChild(renderer.domElement)

  // ライティング設定
  // 主光（太陽光）
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5)
  directionalLight.position.set(1, 2, 1).normalize()
  scene.add(directionalLight)

  // 環境光（柔らかい全方向光）
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
  scene.add(ambientLight)

  // グリッドヘルパー（オプション、ビジュアル確認用）
  const gridHelper = new THREE.GridHelper(5, 10, 0x444444, 0x333333)
  gridHelper.position.y = 0
  scene.add(gridHelper)

  return { scene, camera, renderer, vrm: null }
}

/**
 * レンダラーのサイズをリサイズします。
 * ウィンドウリサイズ時に呼び出してください。
 *
 * @param state - ビューア状態
 * @param width - 新しい幅
 * @param height - 新しい高さ
 */
export function resizeRenderer(
  state: VRMViewerState,
  width: number,
  height: number
): void {
  state.camera.aspect = width / height
  state.camera.updateProjectionMatrix()
  state.renderer.setSize(width, height)
}

/**
 * シーンをクリーンアップします。
 * ビューア破棄時に呼び出してください。
 *
 * @param state - ビューア状態
 */
export function disposeScene(state: VRMViewerState): void {
  state.renderer.dispose()
  state.renderer.domElement.remove()
}
