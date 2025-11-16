/**
 * Core atlas builder
 *
 * マテリアル記述子とテクスチャスロットごとのアトラス画像、
 * そしてマテリアル単位の UV 変換行列を生成する責務を持つ。
 */

import { Mesh, Object3D, Texture } from 'three'
import { packTextures } from './packing'
import type {
  AtlasTextureDescriptor,
  TextureSlot,
  TextureCombinationPattern,
  PatternMaterialMapping,
  OffsetScale,
} from './types'
import { MToonNodeMaterial } from '@pixiv/three-vrm-materials-mtoon/nodes'
import { err, ok, Result } from 'neverthrow'
import { composeImagesToAtlas, ImageMatrixPair } from './image'
import { applyPlacementsToGeometries } from './uv'
import { combineMToonMaterials } from './combine'

// マテリアル結合のエクスポート
export { combineMToonMaterials, createParameterTexture } from './combine'
export type { CombineMaterialOptions, CombinedMeshResult, CombineError } from './types'

/**
 * 受け取ったThree.jsオブジェクトのツリーのメッシュ及びそのマテリアルを走査し、
 * Three.jsの複数MToonNodeMaterialをチャンネルごとにテクスチャパッキング
 * アトラス化したテクスチャを各マテリアルに設定する
 * 対応するメッシュのUVをパッキング結果に基づき修正する
 * 最後にマテリアルを統合してドローコール数を削減する
 *
 * @param rootNode - 最適化対象のThree.jsオブジェクトのルートノード
 * @param atlasSize - 生成するアトラス画像のサイズ（ピクセル）
 * @returns 最適化結果（統合メッシュ情報を含む）
 */
export async function optimizeModelMaterials(
  rootNode: Object3D,
  atlasSize = 2048
): Promise<
  Result<
    {
      combinedMesh?: Mesh
      statistics?: {
        originalMeshCount: number
        originalMaterialCount: number
        reducedDrawCalls: number
      }
    },
    Error
  >
>
{
  const meshes: Mesh[] = []
  rootNode.traverse(obj =>
  {
    if (obj instanceof Mesh)
    {
      meshes.push(obj)
    }
  })

  let materials: MToonNodeMaterial[] = []
  for (const mesh of meshes)
  {
    if (Array.isArray(mesh.material))
    {
      materials.push(...(mesh.material.filter((m) => m instanceof MToonNodeMaterial) as MToonNodeMaterial[]))
    } else if (mesh.material instanceof MToonNodeMaterial)
    {
      materials.push(mesh.material as MToonNodeMaterial)
    }
  }
  materials = Array.from(new Set(materials)) // 重複排除

  // テクスチャ組み合わせパターンを抽出してマッピングを構築
  const patternMappings = buildPatternMaterialMappings(materials)

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

  // パターンごとのアトラス画像を生成
  const atlasesResult = await generateAtlasImagesFromPatterns(
    materials,
    patternMappings,
    packingResult.packed
  )

  if (atlasesResult.isErr())
  {
    return err(atlasesResult.error)
  }

  const atlasMap = atlasesResult.value

  const materialPlacementMap = new Map<MToonNodeMaterial, OffsetScale>()
  patternMappings.forEach((mapping, index) =>
  {
    const placement = packingResult.packed[index]
    for (const materialIndex of mapping.materialIndices)
    {
      const material = materials[materialIndex]
      assignAtlasTexturesToMaterial(material, atlasMap)
      materialPlacementMap.set(material, placement)
    }
  })

  const applyResult = applyPlacementsToGeometries(rootNode, materialPlacementMap)
  if (applyResult.isErr())
  {
    return err(applyResult.error)
  }

  // マテリアル結合処理：複数のMToonNodeMaterialを統合してドローコール数を削減
  const combineResult = combineMToonMaterials(rootNode)
  if (combineResult.isErr())
  {
    // マテリアル結合失敗時は警告として処理を継続
    // テクスチャアトラス化は完了しているため、全体の最適化は成功とみなす
    console.warn('Material combining failed:', combineResult.error.message)
    return ok({})
  }

  const { mesh: combinedMesh, statistics } = combineResult.value

  return ok({
    combinedMesh,
    statistics,
  })
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
 * MToonNodeMaterial のテクスチャスロット一覧
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
 * 現状はMToonNodeMaterialのみ対応
 *
 * @param materials - アトラス化対象のマテリアル配列
 * @param placements - マテリアルごとのパッキング情報配列
 * @returns スロット名をキーにしたアトラス画像のマップ
 */
export async function generateAtlasImages(
  materials: MToonNodeMaterial[],
  placements: OffsetScale[]
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
          uvTransform: placement,
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
  materials: MToonNodeMaterial[],
  patternMappings: PatternMaterialMapping[],
  patternPlacements: OffsetScale[]
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
          uvTransform: placement
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

function assignAtlasTexturesToMaterial(
  material: MToonNodeMaterial,
  atlasMap: AtlasImageMap,
): void
{
  if (atlasMap.map) material.map = atlasMap.map
  if (atlasMap.normalMap) material.normalMap = atlasMap.normalMap
  if (atlasMap.emissiveMap) material.emissiveMap = atlasMap.emissiveMap
  if (atlasMap.shadeMultiplyTexture) material.shadeMultiplyTexture = atlasMap.shadeMultiplyTexture
  if (atlasMap.shadingShiftTexture) material.shadingShiftTexture = atlasMap.shadingShiftTexture
  // MatCapはUV非依存なのでスキップ
  if (atlasMap.rimMultiplyTexture) material.rimMultiplyTexture = atlasMap.rimMultiplyTexture
  if (atlasMap.outlineWidthMultiplyTexture) material.outlineWidthMultiplyTexture = atlasMap.outlineWidthMultiplyTexture
  if (atlasMap.uvAnimationMaskTexture) material.uvAnimationMaskTexture = atlasMap.uvAnimationMaskTexture
}

/**
 * マテリアルからテクスチャ組み合わせパターンを抽出
 *
 * @param material - MToonNodeMaterial
 * @returns テクスチャ組み合わせパターン
 */
function extractTexturePattern(material: MToonNodeMaterial): TextureCombinationPattern
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
 * @param materials - MToonNodeMaterial配列
 * @returns パターンとマテリアルのマッピング配列
 */
function buildPatternMaterialMappings(
  materials: MToonNodeMaterial[]
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
