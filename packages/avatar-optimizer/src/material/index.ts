/**
 * Core atlas builder
 *
 * マテリアル記述子とテクスチャスロットごとのアトラス画像、
 * そしてマテリアル単位の UV 変換行列を生成する責務を持つ。
 */

import { Matrix3, Mesh, Object3D, Texture } from 'three'
import { packTextures } from './packing'
import type {
  MaterialPlacement,
  PackingResult,
  AtlasTextureDescriptor,
} from './types'
import { MToonMaterial } from '@pixiv/three-vrm'
import { err, ok, Result } from 'neverthrow'
import { composeImagesToAtlas, ImageMatrixPair } from './image'
import { remapMeshUVsByMaterial } from './uv'

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

  // null を含む値を処理: 有効なテクスチャから平均を計算して 2 の n 乗に丸める
  const texturesToPack = fillNullTexturesWithAverageDimensions(mainTextures)

  // テクスチャパッキングを実行
  const packingResult = await packTextures(
    texturesToPack,
    atlasSize,
    atlasSize,
  )

  // パッキング結果からマテリアルごとのUV変換行列を構築
  const placements = buildPlacements(packingResult)

  const atlasesResult = await generateAtlasImages(
    materials,
    placements
  )

  if (atlasesResult.isErr())
  {
    throw atlasesResult.error
  }

  const atlasMap = atlasesResult.value

  // 生成されたアトラス画像をマテリアルに設定
  for (let i = 0; i < materials.length; i++)
  {
    const material = materials[i]
    const placement = placements[i]

    // スロットごとにアトラステクスチャをマテリアルに割り当て
    if (atlasMap.map) material.map = atlasMap.map
    if (atlasMap.normalMap) material.normalMap = atlasMap.normalMap
    if (atlasMap.emissiveMap) material.emissiveMap = atlasMap.emissiveMap
    if (atlasMap.shadeMultiplyTexture) material.shadeMultiplyTexture = atlasMap.shadeMultiplyTexture
    if (atlasMap.shadingShiftTexture) material.shadingShiftTexture = atlasMap.shadingShiftTexture
    if (atlasMap.matcapTexture) material.matcapTexture = atlasMap.matcapTexture
    if (atlasMap.rimMultiplyTexture) material.rimMultiplyTexture = atlasMap.rimMultiplyTexture
    if (atlasMap.outlineWidthMultiplyTexture) material.outlineWidthMultiplyTexture = atlasMap.outlineWidthMultiplyTexture
    if (atlasMap.uvAnimationMaskTexture) material.uvAnimationMaskTexture = atlasMap.uvAnimationMaskTexture

    // マテリアルを使用するメッシュの UV 座標を再マッピング
    remapMeshUVsByMaterial(rootNode, material, placement)
  }
}

/**
 * null 要素を有効なテクスチャの平均寸法で埋める
 * 平均値は 2 の n 乗に丸める
 *
 * @param textures - null を含む可能性のあるテクスチャ配列
 * @returns 全て有効な値で埋められたテクスチャ配列
 */
function fillNullTexturesWithAverageDimensions(
  textures: Array<AtlasTextureDescriptor | null>
): AtlasTextureDescriptor[]
{
  // 有効なテクスチャの寸法を収集
  const validTextures = textures.filter(
    (t): t is AtlasTextureDescriptor => t !== null
  )

  // 有効なテクスチャがない場合のフォールバック
  if (validTextures.length === 0)
  {
    return textures.map((t) => t ?? { width: 512, height: 512 })
  }

  // 平均幅・高さを計算
  const avgWidth =
    validTextures.reduce((sum, t) => sum + t.width, 0) / validTextures.length
  const avgHeight =
    validTextures.reduce((sum, t) => sum + t.height, 0) / validTextures.length

  // 平均値を 2 の n 乗に丸める
  const roundedWidth = roundToNearestPowerOfTwo(avgWidth)
  const roundedHeight = roundToNearestPowerOfTwo(avgHeight)

  return textures.map((t) =>
    t ?? { width: roundedWidth, height: roundedHeight }
  )
}

/**
 * 値を最も近い 2 の n 乗に丸める
 * 例: 512 -> 512, 600 -> 512, 700 -> 1024
 *
 * @param value - 丸める値
 * @returns 最も近い 2 の n 乗
 */
function roundToNearestPowerOfTwo(value: number): number
{
  if (value <= 0) return 512 // デフォルト値

  // 下の 2 の n 乗
  const lower = Math.pow(2, Math.floor(Math.log2(value)))
  // 上の 2 の n 乗
  const upper = lower * 2

  // より近い方を返す
  return value - lower < upper - value ? lower : upper
}

/**
 * MToonMaterial のテクスチャスロット一覧
 */
const MATERIAL_TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'emissiveMap',
  'shadeMultiplyTexture',
  'shadingShiftTexture',
  'matcapTexture',
  'rimMultiplyTexture',
  'outlineWidthMultiplyTexture',
  'uvAnimationMaskTexture',
] as const

/**
 * テクスチャスロット名の型
 */
type TextureSlot = typeof MATERIAL_TEXTURE_SLOTS[number]

/**
 * テクスチャスロット名をキーにしたアトラス画像マップの型
 */
export type AtlasImageMap = Record<TextureSlot, Texture>

/** Textureがサイズ情報を持っているか判定するヘルパー関数 */
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
 * @param placements - マテリアルごとのパッキング情報配列
 * @returns スロット名をキーにしたアトラス画像のマップ
 */
export async function generateAtlasImages(
  materials: MToonMaterial[],
  placements: MaterialPlacement[]
): Promise<Result<AtlasImageMap, Error>>
{
  if (materials.length !== placements.length)
  {
    return err(new Error('Materials and packing infos length mismatch'))
  }

  const atlasMap: Partial<AtlasImageMap> = {}

  for (const slot of MATERIAL_TEXTURE_SLOTS)
  {
    const layers: ImageMatrixPair[] = []

    for (let i = 0; i < materials.length; i++)
    {
      const mat = materials[i]
      const placement = placements[i]

      const texture = mat[slot]
      if (texture)
      {
        layers.push({
          image: texture,
          uvTransform: placement.uvTransform,
        })
      }
    }

    const atlasResult = composeImagesToAtlas(layers, {
      width: 2048,
      height: 2048,
    })

    if (atlasResult.isErr())
    {
      return err(atlasResult.error)
    }

    atlasMap[slot] = atlasResult.value
  }

  return ok(atlasMap as AtlasImageMap)
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

    const uvTransform = new Matrix3().set(
      scaleU,
      0,
      translateU,
      0,
      scaleV,
      translateV,
      0,
      0,
      1,
    )

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
