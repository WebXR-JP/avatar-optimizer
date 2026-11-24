import { Texture } from 'three'
import { OffsetScale } from '../../types'

/** Image + UV変換行列のペア */
export interface ImageMatrixPair {
  image: Texture
  uvTransform: OffsetScale
}

/** レンダラー非依存のパック済み MToon パラメータデータ */
export interface PackedMaterialParameters {
  /** スロット × texelsPerSlot × 4 要素の生 Float32Array */
  data: Float32Array
  /** スロット数（= 元のマテリアル数） */
  slotCount: number
  /** スロットあたりの vec4 数（既定 9） */
  texelsPerSlot: number
}
