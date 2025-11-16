/**
 * UV 座標の再マッピング実装（Three.js ベース）
 *
 * テクスチャがアトラス内で物理的に移動した分だけ、
 * モデルの UV 座標も同じ量だけ移動させる
 */

import { BufferGeometry } from 'three'
import type { MaterialPlacement } from './types'
import { ok, err, Result } from 'neverthrow'

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

    // アトラス座標への変換: newUV = translate + scale * oldUV
    const newU = translateU + scaleU * oldU
    const newV = translateV + scaleV * oldV

    uvArray[i] = newU
    uvArray[i + 1] = newV
  }
}

/**
 * BufferGeometry の UV 属性を再マッピング
 *
 * Matrix3 の UV 変換行列（uvTransform）を使用して、
 * 全頂点の UV 座標をアトラス座標空間に変換
 *
 * Matrix3 形式:
 * [ scaleU   0     translateU ]
 * [   0    scaleV  translateV ]
 * [   0      0        1      ]
 *
 * @param geometry - 更新対象のジオメトリ
 * @param placement - マテリアル配置情報（uvTransform を含む）
 */
export function remapGeometryUVs(
  geometry: BufferGeometry,
  placement: MaterialPlacement,
): Result<void, Error>
{
  // uv 属性を取得
  const uvAttribute = geometry.getAttribute('uv')
  if (!uvAttribute)
  {
    return err(new Error('UV attribute not found'))
  }

  // UV データを取得
  const uvArray = uvAttribute.array as Float32Array
  if (!uvArray) return err(new Error('UV array not found'))
  if (uvAttribute.itemSize !== 2)
  {
    return err(new Error('UV attribute itemSize must be 2'))
  }

  // Matrix3 から変換係数を抽出
  const elements = placement.uvTransform.elements
  const scaleU = elements[0]
  const scaleV = elements[4]
  const translateU = elements[6]
  const translateV = elements[7]

  // 全頂点の UV を変換
  applyUVTransform(uvArray, scaleU, scaleV, translateU, translateV)

  // 属性を更新
  uvAttribute.needsUpdate = true
  return ok()
}
