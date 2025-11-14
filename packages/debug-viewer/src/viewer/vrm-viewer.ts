import { ResultAsync } from 'neverthrow'
import { loadVRM, loadVRMFromFile } from '../utils/loader'
import { setupScene, resizeRenderer, disposeScene } from './scene-setup'
import type { VRMViewerOptions, VRMViewerState, ViewerError } from '../types'

/**
 * VRM モデルをリアルタイム表示するビューアクラス。
 * Three.js と @pixiv/three-vrm を使用して VRM モデルのビジュアライゼーション
 * と基本的なアニメーション制御を提供します。
 */
export class VRMViewer {
  private state: VRMViewerState
  private animationFrameId: number | null = null
  private lastTime: number = 0

  /**
   * VRMビューアを初期化します。
   * 指定されたコンテナ要素内にWebGLレンダラーを作成します。
   *
   * @param options - ビューアオプション
   */
  constructor(options: VRMViewerOptions) {
    if (!options.container) {
      throw new Error('Container element is required')
    }

    this.state = setupScene(options)
    this.lastTime = Date.now()
    this.startAnimation()
  }

  /**
   * URLから VRM ファイルを読み込みシーンに追加します。
   *
   * @param url - VRM ファイルの URL
   * @returns 読み込み成功時は void、失敗時はエラー
   */
  loadVRM(url: string): ResultAsync<void, ViewerError> {
    return loadVRM(url).map((vrm) => {
      this.setVRM(vrm)
    })
  }

  /**
   * File オブジェクトから VRM ファイルを読み込みシーンに追加します。
   * ブラウザのファイル入力フォームとの連携に使用します。
   *
   * @param file - VRM ファイルの File オブジェクト
   * @returns 読み込み成功時は void、失敗時はエラー
   */
  loadVRMFile(file: File): ResultAsync<void, ViewerError> {
    return loadVRMFromFile(file).map((vrm) => {
      this.setVRM(vrm)
    })
  }

  /**
   * シーンに VRM を設定します。
   * 既存の VRM がある場合は削除します。
   *
   * @param vrm - 設定する VRM オブジェクト
   */
  private setVRM(vrm: any): void {
    // 既存 VRM があれば削除
    if (this.state.vrm) {
      this.state.scene.remove(this.state.vrm.scene)
    }

    // 新しい VRM を追加
    this.state.scene.add(vrm.scene)
    this.state.vrm = vrm

    // VRM を適切なスケールで配置
    vrm.scene.position.set(0, 0, 0)
  }

  /**
   * アニメーションループを開始します。
   */
  private startAnimation(): void {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate)

      const currentTime = Date.now()
      const deltaTime = (currentTime - this.lastTime) / 1000
      this.lastTime = currentTime

      // VRM を更新（アニメーション処理）
      if (this.state.vrm) {
        this.state.vrm.update(Math.min(deltaTime, 0.016)) // Cap at ~60fps
      }

      // レンダリング
      this.state.renderer.render(this.state.scene, this.state.camera)
    }

    animate()
  }

  /**
   * ウィンドウのリサイズに対応します。
   * ウィンドウリサイズイベント時に呼び出してください。
   *
   * @param width - 新しい幅（px）
   * @param height - 新しい高さ（px）
   */
  resize(width: number, height: number): void {
    resizeRenderer(this.state, width, height)
  }

  /**
   * ビューアを破棄します。
   * メモリ解放とリソースクリーンアップを行います。
   * 破棄後はビューアを再利用できません。
   */
  dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
    }

    if (this.state.vrm) {
      this.state.scene.remove(this.state.vrm.scene)
    }

    disposeScene(this.state)
  }

  /**
   * 内部状態を取得します（テスト・デバッグ用）。
   *
   * @returns ビューア状態
   */
  getState(): Readonly<VRMViewerState> {
    return this.state
  }
}
