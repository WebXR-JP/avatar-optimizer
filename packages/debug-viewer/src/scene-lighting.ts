/**
 * 3D シーンの共通ライティング設定
 *
 * Three.js r155 以降の物理ライト単位と MToon の diffuseColor / PI により、
 * ライトの合計強度が PI（約 3.14）付近で本来の発色に近づく。
 *
 * 通常の 3D ビューポート（components/VRMScene.tsx）とストレステスト
 * （components/StressViewer.tsx）の双方から参照して見え方を揃える。
 */
export const SCENE_LIGHTING = {
  ambient: {
    color: 0xffffff,
    intensity: 0.6,
  },
  directional: {
    color: 0xffffff,
    intensity: 2.2,
    position: [5, 8, 6] as readonly [number, number, number],
    shadowMapSize: 2048,
    shadowBias: -0.0005,
  },
} as const
