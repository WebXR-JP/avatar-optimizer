/**
 * UV 座標の再マッピング実装（Three.js ベース）
 *
 * テクスチャがアトラス内で物理的に移動した分だけ、
 * モデルの UV 座標も同じ量だけ移動させる
 */

import { BufferGeometry, Vector2 } from 'three'
import { ok, err, Result } from 'neverthrow'
import { OffsetScale, OptimizationError } from '../../types';

function wrapUV(uv: Vector2)
{
  return new Vector2(
    uv.x - Math.floor(uv.x),
    uv.y - Math.floor(uv.y)
  );
}

/**
 * UV 座標を変換する共通処理
 *
 * @param uvArray - UV 配列
 * @param scaleU - U スケール係数
 * @param scaleV - V スケール係数
 * @param translateU - U トランスレート値
 * @param translateV - V トランスレート値
 * @param startIndex - 処理開始インデックス
 * @param endIndex - 処理終了インデックス（含まない）
 */
function applyUVTransform(
  uvArray: Float32Array,
  scaleU: number,
  scaleV: number,
  translateU: number,
  translateV: number,
  startIndex: number = 0,
  endIndex: number = uvArray.length,
): void
{
  for (let i = startIndex; i < endIndex; i += 2)
  {
    const oldU = uvArray[i]
    const oldV = uvArray[i + 1]

    // 先に0-1範囲にラップ
    const wrapped = wrapUV(new Vector2(oldU, oldV))
    const oldUWrapped = wrapped.x
    const oldVWrapped = wrapped.y

    // アトラス座標への変換: newUV = translate + scale * oldUV
    const newU = translateU + scaleU * oldUWrapped
    const newV = translateV + scaleV * oldVWrapped
    uvArray[i] = newU
    uvArray[i + 1] = newV
  }
}

/**
 * BufferGeometry の UV 属性を再マッピング
 *
 * @param geometry - 更新対象のジオメトリ
 * @param uvTransform - UV配置情報
 */
export function remapGeometryUVs(
  geometry: BufferGeometry,
  uvTransform: OffsetScale,
): Result<void, OptimizationError>
{
  // uv 属性を取得
  const uvAttribute = geometry.getAttribute('uv')
  if (!uvAttribute)
  {
    return err({ type: 'ASSET_ERROR', message: 'UVアトリビュートが存在しません' })
  }

  // UV データを取得
  const uvArray = uvAttribute.array as Float32Array
  if (!uvArray) return err({ type: 'ASSET_ERROR', message: 'UVアトリビュート配列が存在しません' })
  if (uvAttribute.itemSize !== 2)
  {
    return err({ type: 'ASSET_ERROR', message: 'UVアトリビュートの要素数が2ではありません' })
  }

  // 全頂点の UV を変換
  applyUVTransform(uvArray, uvTransform.scale.x, uvTransform.scale.y, uvTransform.offset.x, uvTransform.offset.y)

  // 属性を更新
  uvAttribute.needsUpdate = true
  return ok()
}
