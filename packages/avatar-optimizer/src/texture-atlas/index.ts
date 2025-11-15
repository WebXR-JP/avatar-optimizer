/**
 * Core atlas builder
 *
 * マテリアル記述子とテクスチャスロットごとのアトラス画像、
 * そしてマテリアル単位の UV 変換行列を生成する責務を持つ。
 */

import { Material, Mesh, Object3D } from 'three'
import { packTextures } from './packing'
import type {
  MaterialPlacement,
  TexturePackingInfo,
  SlotAtlasImage,
  PackingResult,
  AtlasTextureDescriptor,
} from './types'
import { MToonMaterial } from '@pixiv/three-vrm'
import { ResultAsync } from 'neverthrow'

/**
 * 受け取ったThree.jsオブジェクトのツリーのメッシュ及びそのマテリアルを走査し、
 * Three.jsの複数MToonMaterialをチャンネルごとにテクスチャパッキング
 * アトラス化したテクスチャを各マテリアルに設定する
 * 対応するメッシュのUVをパッキング結果に基づき修正する
 *
 * @param rootNode - 最適化対象のThree.jsオブジェクトのルートノード
 * @param atlasSize - 生成するアトラス画像のサイズ（ピクセル）
 */
export async function setAtlasTexturesToObjectsWithCorrectUV(rootNode: Object3D, atlasSize = 2048): Promise<void>
{
  const meshes: Mesh[] = []
  rootNode.traverse(obj =>
  {
    if (obj instanceof Mesh)
    {
      meshes.push(obj)
    }
  })

  let materials: MToonMaterial[] = []
  for (const mesh of meshes)
  {
    if (Array.isArray(mesh.material))
    {
      materials.push(...(mesh.material.filter((m) => m instanceof MToonMaterial) as MToonMaterial[]))
    } else if (mesh.material instanceof MToonMaterial)
    {
      materials.push(mesh.material as MToonMaterial)
    }
  }
  materials = Array.from(new Set(materials)) // 重複排除

  const mainTextures = materials.map(mat =>
  {
    if (!mat.map) return null
    if (!hasSize(mat.map.image)) return null
    return {
      width: mat.map.image.width,
      height: mat.map.image.height,
    } as AtlasTextureDescriptor
  })

  // nullを除外してpackTexturesに渡す、その後インデックス関係を復元
  const packingInfos = await applyPreservingNullIndices(mainTextures, (validTextures) =>
    packTextures(
      validTextures.map(t => ({ width: t.width, height: t.height })),
      atlasSize,
      atlasSize,
    ).then((result) => result.packed),
  )

  const atlases = await generateAtlasImages(
    materials,
    normalizedPacking,
    normalizedRectsByMaterialId,
    pixelRectsByMaterialId,
  )

  // TODO: 生成されたアトラス画像をマテリアルに設定
  for (const atlas of atlases)
  {
    // TODO: atlasImage を Three.js テクスチャに変換
    // TODO: 対応するマテリアルのスロットに適用
  }

  // TODO: プリミティブの UV 座標を再マッピング
  for (const mesh of meshes)
  {
    // TODO: Geometry から TEXCOORD_0 を更新
  }
}

function hasSize(
  img: any
): img is { width: number; height: number }
{
  return img && typeof img.width === 'number' && typeof img.height === 'number';
}

/**
 * 各チャンネル(例: MainTex, BumpMap)ごとのアトラス画像を生成する
 * 現状はMToonMaterialのみ対応
 *
 * @param materials - アトラス化対象のマテリアル配列
 * @param normalizedPacking
 * @param normalizedRectsByMaterialId
 * @param pixelRectsByMaterialId
 * @returns
 */
export async function generateAtlasImages(
  materials: MToonMaterial[],
  packingInfos: (TexturePackingInfo | null)[],
): Promise<ResultAsync<SlotAtlasImage[] , Error>>
{
  if (materials.length !== packingInfos.length)
  {
    throw new Error('Materials and packing infos length mismatch')
  }

  for (const mat of materials)
  {
    const atlasImage = await drawImagesToAtlasBuffer(slotPacking, images)

    atlases.push({
      slot,
      atlasImage,
      atlasWidth: normalizedPacking.atlasWidth,
      atlasHeight: normalizedPacking.atlasHeight,
    })
  }

  return atlases
}

/**
 * PackingResultのピクセル単位情報からUV変換行列を構築する
 * @param packingResult - ピクセル単位のパッキング結果
 * @returns - マテリアルごとのUV変換行列配列
 */
function buildPlacements(
  packingResult: PackingResult,
): MaterialPlacement[]
{
  return packingResult.packed.map((tex) =>
  {
    const scaleU = tex.scaledWidth / tex.sourceWidth
    const scaleV = tex.scaledHeight / tex.sourceHeight
    const translateU = tex.x / packingResult.atlasWidth
    const translateV = tex.y / packingResult.atlasHeight

    const uvTransform: MaterialPlacement['uvTransform'] = [
      scaleU,
      0,
      translateU,
      0,
      scaleV,
      translateV,
      0,
      0,
      1,
    ]

    return {
      uvTransform,
    }
  })
}

/**
 * nullを除外して関数を実行し、結果にnullを再挿入してインデックス関係を復元
 * @param items - (T | null)[] 配列
 * @param fn - null以外のアイテムを受け取る非同期関数
 * @returns インデックス関係が保たれた結果
 */
async function applyPreservingNullIndices<T, R>(
  items: Array<T | null>,
  fn: (validItems: T[]) => Promise<R[]>,
): Promise<Array<R | null>>
{
  // nullを除外しつつ、元のインデックスを保持
  const validItems: Array<{ item: T; originalIndex: number }> = []
  for (let i = 0; i < items.length; i++)
  {
    if (items[i] !== null)
    {
      validItems.push({
        item: items[i]!,
        originalIndex: i,
      })
    }
  }

  // nullが全部の場合は空結果を返す
  if (validItems.length === 0)
  {
    return Array(items.length).fill(null)
  }

  // 有効なアイテムのみで関数を実行
  const results = await fn(validItems.map(v => v.item))

  // 結果にnullを再挿入してインデックスを復元
  const resultsWithNulls: Array<R | null> = Array(items.length).fill(null)
  for (let i = 0; i < results.length; i++)
  {
    const original = validItems[i]
    resultsWithNulls[original.originalIndex] = results[i]
  }

  return resultsWithNulls
}
