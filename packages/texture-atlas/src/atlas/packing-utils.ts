import type { NormalizedPackingResult, PackingResult } from '../types'

/**
 * PackingResult (ピクセル座標) を UV 正規化座標へ変換
 */
export function toNormalizedPackingResult(
  packing: PackingResult,
): NormalizedPackingResult {
  const { atlasWidth, atlasHeight } = packing

  const packed = packing.packed.map((rect) => {
    const uvMinU = rect.x / atlasWidth
    const uvMinV = rect.y / atlasHeight
    const uvMaxU = (rect.x + rect.width) / atlasWidth
    const uvMaxV = (rect.y + rect.height) / atlasHeight

    return {
      index: rect.index,
      uvMin: { u: uvMinU, v: uvMinV },
      uvMax: { u: uvMaxU, v: uvMaxV },
      sourceWidth: rect.sourceWidth,
      sourceHeight: rect.sourceHeight,
      scaledWidth: rect.scaledWidth,
      scaledHeight: rect.scaledHeight,
    }
  })

  return {
    atlasWidth,
    atlasHeight,
    packed,
  }
}
