/**
 * UV 座標の再マッピング実装（Three.js ベース）
 *
 * テクスチャがアトラス内で物理的に移動した分だけ、
 * モデルの UV 座標も同じ量だけ移動させる
 */

import { BufferGeometry, Mesh, Object3D } from 'three'
import type { MaterialPlacement } from './types'
import { MToonMaterial } from '@pixiv/three-vrm'
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

/**
 * BufferGeometry の特定グループの UV 属性を再マッピング
 *
 * グループはジオメトリの groups 配列で定義される
 * マテリアルインデックスに対応するグループのみ処理
 *
 * @param geometry - 更新対象のジオメトリ
 * @param placement - マテリアル配置情報（uvTransform を含む）
 * @param materialIndex - マテリアル配列内のインデックス
 */
export function remapGeometryUVsByGroup(
  geometry: BufferGeometry,
  placement: MaterialPlacement,
  materialIndex: number,
): Result<void, Error>
{
  // uv 属性を取得
  const uvAttribute = geometry.getAttribute('uv')
  if (!uvAttribute)
  {
    return err(new Error('UV attribute not found'))
  }

  // グループ情報を取得
  const groups = geometry.groups
  if (groups.length === 0)
  {
    // グループがない場合は全体を処理
    return remapGeometryUVs(geometry, placement)
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

  // マテリアルインデックスに紐づく全グループを抽出
  const targetGroups = groups.filter((group) => group.materialIndex === materialIndex)
  if (targetGroups.length === 0)
  {
    // グループが見つからない場合は処理対象がないため成功扱い
    return ok()
  }

  const indexAttribute = geometry.getIndex()

  if (!indexAttribute)
  {
    // 非インデックスジオメトリ: group.start/count は Face Corner（= 頂点）数
    for (const group of targetGroups)
    {
      const startElement = group.start * uvAttribute.itemSize
      const endElement = startElement + group.count * uvAttribute.itemSize
      applyUVTransform(uvArray, scaleU, scaleV, translateU, translateV, startElement, endElement)
    }
  } else
  {
    // インデックスジオメトリ: group.start/count はインデックス配列上の範囲
    const indexArray = indexAttribute.array as ArrayLike<number>
    const visitedVertices = new Set<number>()

    for (const group of targetGroups)
    {
      const start = group.start
      const end = start + group.count

      for (let i = start; i < end; i += 1)
      {
        const vertexIndex = indexArray[i]
        if (visitedVertices.has(vertexIndex))
        {
          continue
        }
        visitedVertices.add(vertexIndex)

        const offset = vertexIndex * uvAttribute.itemSize
        applyUVTransform(uvArray, scaleU, scaleV, translateU, translateV, offset, offset + uvAttribute.itemSize)
      }
    }
  }

  // 属性を更新
  uvAttribute.needsUpdate = true

  return ok()
}
