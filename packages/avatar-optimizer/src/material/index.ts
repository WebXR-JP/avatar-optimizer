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
  TextureSlot,
  TextureCombinationPattern,
  PatternMaterialMapping,
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
export async function setAtlasTexturesToObjectsWithCorrectUV(rootNode: Object3D, atlasSize = 2048): Promise<Result<void, Error>>
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
  console.log('found materials:', materials)

  // テクスチャ組み合わせパターンを抽出してマッピングを構築
  const patternMappings = buildPatternMaterialMappings(materials)
  console.log('unique texture patterns:', patternMappings.length)

  // パターンごとのテクスチャディスクリプタを収集
  const textureDescriptors = patternMappings.map(m => m.textureDescriptor)

  // width/heightが0のものを有効なテクスチャの平均値で埋める
  const texturesToPack = fillNullTexturesWithAverageDimensions(
    textureDescriptors.map(d => (d.width > 0 && d.height > 0) ? d : null)
  )

  // テクスチャパッキングを実行（パターン数分）
  const packingResult = await packTextures(
    texturesToPack,
    atlasSize,
    atlasSize,
  )

  // パッキング結果からパターンごとのUV変換行列を構築
  const patternPlacements = buildPlacements(packingResult)

  // パターンごとのアトラス画像を生成
  const atlasesResult = await generateAtlasImagesFromPatterns(
    materials,
    patternMappings,
    patternPlacements
  )

  if (atlasesResult.isErr())
  {
    return err(atlasesResult.error)
  }

  const atlasMap = atlasesResult.value

  // 各マテリアルにアトラス画像とUV変換を設定
  for (const mapping of patternMappings)
  {
    const patternIndex = patternMappings.indexOf(mapping)
    const placement = patternPlacements[patternIndex]

    // このパターンを使用するすべてのマテリアルに適用
    for (const materialIndex of mapping.materialIndices)
    {
      const material = materials[materialIndex]

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

  return ok()
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
const MATERIAL_TEXTURE_SLOTS: TextureSlot[] = [
  'map',
  'normalMap',
  'emissiveMap',
  'shadeMultiplyTexture',
  'shadingShiftTexture',
  'matcapTexture',
  'rimMultiplyTexture',
  'outlineWidthMultiplyTexture',
  'uvAnimationMaskTexture',
]

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
 * テクスチャ組み合わせパターンに基づいてアトラス画像を生成
 * 各スロットごとに、一意なパターンのテクスチャのみをアトラス化
 *
 * @param materials - 全マテリアル配列
 * @param patternMappings - パターンとマテリアルのマッピング
 * @param patternPlacements - パターンごとのUV変換行列
 * @returns スロット名をキーにしたアトラス画像のマップ
 */
async function generateAtlasImagesFromPatterns(
  materials: MToonMaterial[],
  patternMappings: PatternMaterialMapping[],
  patternPlacements: MaterialPlacement[]
): Promise<Result<AtlasImageMap, Error>>
{
  if (patternMappings.length !== patternPlacements.length)
  {
    return err(new Error('Pattern mappings and placements length mismatch'))
  }

  const atlasMap: Partial<AtlasImageMap> = {}

  for (const slot of MATERIAL_TEXTURE_SLOTS)
  {
    const layers: ImageMatrixPair[] = []

    // 各パターンについて、最初のマテリアルからテクスチャを取得
    for (let i = 0; i < patternMappings.length; i++)
    {
      const mapping = patternMappings[i]
      const placement = patternPlacements[i]

      // このパターンの最初のマテリアルを代表として使用
      const representativeMaterialIndex = mapping.materialIndices[0]
      const material = materials[representativeMaterialIndex]

      const texture = material[slot]
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

/**
 * 2つのテクスチャが同じ画像を参照しているか判定する
 * テクスチャのuuidではなく、imageオブジェクトの同一性で判定
 *
 * @param tex1 - 比較するテクスチャ1
 * @param tex2 - 比較するテクスチャ2
 * @returns 同じ画像を参照している場合true
 */
function isSameImage(tex1: Texture | null, tex2: Texture | null): boolean
{
  if (tex1 === null && tex2 === null) return true
  if (tex1 === null || tex2 === null) return false

  // imageオブジェクトの参照が同じかチェック
  return tex1.image === tex2.image
}

/**
 * マテリアルからテクスチャ組み合わせパターンを抽出
 *
 * @param material - MToonMaterial
 * @returns テクスチャ組み合わせパターン
 */
function extractTexturePattern(material: MToonMaterial): TextureCombinationPattern
{
  const slots = new Map<TextureSlot, any | null>()

  for (const slot of MATERIAL_TEXTURE_SLOTS)
  {
    const texture = material[slot]
    // テクスチャのimageオブジェクトを保持（nullの場合はnull）
    slots.set(slot, texture?.image ?? null)
  }

  return { slots }
}

/**
 * 2つのテクスチャ組み合わせパターンが同じか判定
 * 各スロットのimageオブジェクトの同一性で判定
 *
 * @param pattern1 - パターン1
 * @param pattern2 - パターン2
 * @returns 同じパターンの場合true
 */
function isSamePattern(
  pattern1: TextureCombinationPattern,
  pattern2: TextureCombinationPattern
): boolean
{
  for (const slot of MATERIAL_TEXTURE_SLOTS)
  {
    const img1 = pattern1.slots.get(slot) ?? null
    const img2 = pattern2.slots.get(slot) ?? null

    // imageオブジェクトの参照が異なる場合はfalse
    if (img1 !== img2) return false
  }

  return true
}

/**
 * マテリアル配列から一意なテクスチャ組み合わせパターンを抽出し、
 * 各パターンを使用するマテリアルのインデックスをマッピング
 *
 * @param materials - MToonMaterial配列
 * @returns パターンとマテリアルのマッピング配列
 */
function buildPatternMaterialMappings(
  materials: MToonMaterial[]
): PatternMaterialMapping[]
{
  const mappings: PatternMaterialMapping[] = []

  for (let i = 0; i < materials.length; i++)
  {
    const material = materials[i]
    const pattern = extractTexturePattern(material)

    // 既存のパターンと一致するか確認
    const existingMapping = mappings.find(m => isSamePattern(m.pattern, pattern))

    if (existingMapping)
    {
      // 既存パターンにマテリアルインデックスを追加
      existingMapping.materialIndices.push(i)
    }
    else
    {
      // 新しいパターンとして追加
      // テクスチャディスクリプタはmapスロットから取得（nullの場合は後で平均値で埋める）
      const mapTexture = material.map
      const textureDescriptor: AtlasTextureDescriptor = (mapTexture && hasSize(mapTexture.image))
        ? {
            width: mapTexture.image.width,
            height: mapTexture.image.height,
          }
        : {
            width: 0,
            height: 0,
          }

      mappings.push({
        pattern,
        materialIndices: [i],
        textureDescriptor,
      })
    }
  }

  return mappings
}
