import { useEffect, useRef, useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import { PerspectiveCamera } from 'three'
import type { VRM } from '@pixiv/three-vrm'

/**
 * VRM シーンのセットアップとクリーンアップを管理するカスタムフック。
 * カメラ、ライティング、グリッドなど初期設定を行い、
 * VRM の読み込みと破棄を管理します。
 */
export function useVRMScene() {
  const { scene, camera, gl } = useThree()
  const vrmRef = useRef<VRM | null>(null)

  // シーンの初期化（最初の1回のみ）
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return

    // カメラ位置の設定
    camera.position.set(0, 1.5, 3)
    camera.lookAt(0, 1, 0)

    // レンダラー設定
    gl.outputColorSpace = 'srgb'
  }, [camera, gl])

  /**
   * VRM をシーンに追加します。
   * 既存の VRM がある場合は削除します。
   */
  const setVRM = useCallback((vrm: VRM) => {
    // 既存 VRM があれば削除
    if (vrmRef.current) {
      scene.remove(vrmRef.current.scene)
    }

    // 新しい VRM を追加
    scene.add(vrm.scene)
    vrmRef.current = vrm

    // VRM を適切なスケールで配置
    vrm.scene.position.set(0, 0, 0)
  }, [scene])

  /**
   * VRM を更新します（アニメーション更新）。
   */
  const updateVRM = useCallback((deltaTime: number) => {
    if (vrmRef.current) {
      // deltaTime は秒単位で、最大 0.016秒（60FPS相当）でキャップ
      vrmRef.current.update(Math.min(deltaTime, 0.016))
    }
  }, [])

  /**
   * 現在のVRMを取得します（テスト・デバッグ用）。
   */
  const getVRM = useCallback(() => vrmRef.current, [])

  /**
   * VRM をシーンから削除し、リソースを解放します。
   */
  const disposeVRM = useCallback(() => {
    if (vrmRef.current) {
      scene.remove(vrmRef.current.scene)
      vrmRef.current = null
    }
  }, [scene])

  return {
    setVRM,
    updateVRM,
    getVRM,
    disposeVRM,
    vrmRef,
  }
}
