/**
 * UV 座標の再マッピング実装（Three.js ベース）
 *
 * テクスチャがアトラス内で物理的に移動した分だけ、
 * モデルの UV 座標も同じ量だけ移動させる
 */

import { BufferGeometry, Mesh, Object3D, Vector2 } from 'three'
import { ok, err, Result } from 'neverthrow'
import { MToonNodeMaterial } from '@pixiv/three-vrm-materials-mtoon/nodes';
import { OffsetScale } from '../types';
import { MToonMaterial } from '@pixiv/three-vrm';

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

  // 全頂点の UV を変換
  applyUVTransform(uvArray, uvTransform.scale.x, uvTransform.scale.y, uvTransform.offset.x, uvTransform.offset.y)

  // 属性を更新
  uvAttribute.needsUpdate = true
  return ok()
}

/**
 * GLTF/VRM フロー前提で 1 Mesh = 1 Material のみをサポートし、(ただし Outline付きMToonは例外的に複数マテリアルを許容)
 * 実装簡略化と UV 再マッピングの二重適用防止を優先する。
 * 複数マテリアルの Mesh を検出した場合はエラーを返す。
 * MToonNodeMaterial のみを対象とする。
 *
 * @param rootNode - 処理対象のルートノード
 * @param materialPlacementMap - マテリアルごとの UV 配置情報マップ
 * @returns 処理結果
 */
export function applyPlacementsToGeometries(
  rootNode: Object3D,
  materialPlacementMap: Map<MToonMaterial, OffsetScale>,
): Result<void, Error>
{
  try
  {
    rootNode.traverse((obj) =>
    {
      if (!(obj instanceof Mesh)) return
      if (!(obj.geometry instanceof BufferGeometry)) return

      let material: MToonMaterial | null = null

      if (Array.isArray(obj.material))
      {
        // Outline付きMToonの場合はOutline用に複数マテリアルになっている
        // 両マテリアルが全インデックスを参照するため、同様に1つのマテリアルだけ処理すればいい。
        material = obj.material[0];
      } else if (obj.material instanceof MToonMaterial)
      {
        material = obj.material
      }

      if (!(material instanceof MToonMaterial))
      {
        return
      }

      const placement = materialPlacementMap.get(material)
      if (!placement)
      {
        return
      }

      const clonedGeometry = obj.geometry.clone()
      obj.geometry.dispose()
      obj.geometry = clonedGeometry

      const result = remapGeometryUVs(clonedGeometry, placement)
      if (result.isErr())
      {
        throw result.error
      }
    })

    return ok()
  }
  catch (error)
  {
    return err(error instanceof Error ? error : new Error(String(error)))
  }
}

/**
 * Object3D 以下の各 Mesh の UV bounding box をログ出力する
 * デバッグ用関数
 *
 * @param rootNode - 対象の Object3D
 */
export function debugLogMeshUVBounds(rootNode: Object3D): void
{
  const meshUVBounds: Array<{
    meshName: string
    width: number
    height: number
  }> = []

  rootNode.traverse((obj) =>
  {
    if (!(obj instanceof Mesh)) return
    if (!(obj.geometry instanceof BufferGeometry)) return

    const uvAttribute = obj.geometry.getAttribute('uv')
    if (!uvAttribute) return

    const uvArray = uvAttribute.array as Float32Array
    if (!uvArray) return

    // UV bounding box を計算
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity

    for (let i = 0; i < uvArray.length; i += 2)
    {
      const u = uvArray[i]
      const v = uvArray[i + 1]
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }

    const width = maxU - minU
    const height = maxV - minV

    meshUVBounds.push({
      meshName: obj.name,
      width,
      height
    })
  })

  console.log('=== Mesh UV Bounds ===')
  meshUVBounds.forEach((bounds) =>
  {
    console.log(`[${bounds.meshName}] width: ${bounds.width.toFixed(4)}, height: ${bounds.height.toFixed(4)}`)
  })
}

// テスト用に内部処理を公開（Single-Material mesh 前提）
export const __applyPlacementsToGeometries = applyPlacementsToGeometries
