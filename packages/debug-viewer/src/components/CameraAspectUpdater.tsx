/**
 * カメラのアスペクト比をキャンバスの実サイズに追従させる
 *
 * WebGPU のレンダラーは非同期で生成されるため、R3F がサイズを確定したあとに
 * カメラの初期化が走ることがある。その場合 camera.aspect が 0 のままになり、
 * 射影行列が Infinity / NaN になって何も描画されない（画面が真っ暗・グレーになる）。
 * サイズが変わるたびに明示的に aspect と射影行列を更新する。
 */
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'

export function CameraAspectUpdater()
{
  const { camera, size } = useThree()

  useEffect(() =>
  {
    const perspectiveCamera = camera as PerspectiveCamera
    if (perspectiveCamera.type !== 'PerspectiveCamera') return
    if (size.width <= 0 || size.height <= 0) return
    // R3F が保持するカメラは外部オブジェクトで、プロパティ更新が正しい使い方
    // eslint-disable-next-line react-hooks/immutability
    perspectiveCamera.aspect = size.width / size.height
    perspectiveCamera.updateProjectionMatrix()
  }, [camera, size])

  return null
}
