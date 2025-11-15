/**
 * UV 座標の再マッピング実装（Three.js ベース）
 *
 * テクスチャがアトラス内で物理的に移動した分だけ、
 * モデルの UV 座標も同じ量だけ移動させる
 */

import { BufferGeometry, Mesh, Object3D } from 'three'
import type { MaterialPlacement } from './types'
import { MToonMaterial } from '@pixiv/three-vrm'

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
): void
{
  // uv 属性を取得
  const uvAttribute = geometry.getAttribute('uv')
  if (!uvAttribute)
  {
    return
  }

  // UV データを取得
  const uvArray = uvAttribute.array as Float32Array
  if (!uvArray) return

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
}

/**
 * 指定したマテリアルを使用するメッシュのサブメッシュ単位で UV を再マッピング
 *
 * マテリアルが配列の場合、該当インデックスのグループのみ処理
 * マテリアルが単一の場合、全体を処理
 *
 * @param rootNode - ルートノード
 * @param material - 対象のマテリアル
 * @param placement - マテリアル配置情報（uvTransform を含む）
 */
export function remapMeshUVsByMaterial(
  rootNode: Object3D,
  material: MToonMaterial,
  placement: MaterialPlacement,
): void
{
  rootNode.traverse((obj) =>
  {
    if (obj.type === 'Mesh')
    {
      const mesh = obj as Mesh

      if (!(mesh.geometry instanceof BufferGeometry))
      {
        return
      }

      // マテリアルが配列の場合と単一マテリアルの場合に分岐
      if (Array.isArray(mesh.material))
      {
        // 配列マテリアル：該当インデックスのグループのみ処理
        const materialIndex = mesh.material.indexOf(material)
        if (materialIndex !== -1)
        {
          remapGeometryUVsByGroup(mesh.geometry, placement, materialIndex)
        }
      } else if (mesh.material === material)
      {
        // 単一マテリアル：全体を処理
        remapGeometryUVs(mesh.geometry, placement)
      }
    }
  })
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
): void
{
  // uv 属性を取得
  const uvAttribute = geometry.getAttribute('uv')
  if (!uvAttribute)
  {
    return
  }

  // グループ情報を取得
  const groups = geometry.groups
  if (groups.length === 0)
  {
    // グループがない場合は全体を処理
    remapGeometryUVs(geometry, placement)
    return
  }

  // UV データを取得
  const uvArray = uvAttribute.array as Float32Array
  if (!uvArray) return

  // Matrix3 から変換係数を抽出
  const elements = placement.uvTransform.elements
  const scaleU = elements[0]
  const scaleV = elements[4]
  const translateU = elements[6]
  const translateV = elements[7]

  // 該当マテリアルインデックスのグループを処理
  if (materialIndex < groups.length)
  {
    const group = groups[materialIndex]
    const start = group.start
    const count = group.count
    const end = start + count

    // グループ範囲の UV を変換
    applyUVTransform(uvArray, scaleU, scaleV, translateU, translateV, start, end)
  }

  // 属性を更新
  uvAttribute.needsUpdate = true
}
