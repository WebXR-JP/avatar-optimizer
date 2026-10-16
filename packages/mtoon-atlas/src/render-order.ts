/**
 * MToon の半透明メッシュに付ける renderOrder
 *
 * three-vrm（MToonMaterialLoaderPlugin._parseRenderOrder）は MToon の半透明を
 * 「深度書き込みあり（transparentWithZWrite）は 0、なしは 19」で描き、
 * 深度を書くものを先に描く。renderOrder は glTF に保存されないため、
 * avatar-optimizer（最適化直後）と MToonAtlasLoaderPlugin（再読み込み時）の
 * 両方がこの値を使って同じ見た目にする。renderQueueOffsetNumber は
 * 保存していないので 0 扱い
 */
export const MTOON_TRANSPARENT_ZWRITE_RENDER_ORDER = 0
export const MTOON_TRANSPARENT_RENDER_ORDER = 19

/**
 * マテリアルの透過設定から renderOrder を求める
 * 半透明でないものは three の既定（0）のまま
 */
export function getMToonRenderOrder(material: {
  transparent: boolean
  depthWrite: boolean
}): number
{
  if (!material.transparent) return 0
  return material.depthWrite
    ? MTOON_TRANSPARENT_ZWRITE_RENDER_ORDER
    : MTOON_TRANSPARENT_RENDER_ORDER
}
