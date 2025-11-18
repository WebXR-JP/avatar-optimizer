import { Texture } from 'three'
import { OffsetScale } from '../../types'

/** Image + UV変換行列のペア */
export interface ImageMatrixPair {
  image: Texture
  uvTransform: OffsetScale
}
