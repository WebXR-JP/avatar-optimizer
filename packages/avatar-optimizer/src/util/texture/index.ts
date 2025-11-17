import { err, ok, Result } from "neverthrow"
import { AtlasImageMap, AtlasTextureDescriptor, MTOON_TEXTURE_SLOTS, OffsetScale, OptimizationError, PARAMETER_LAYOUT, ParameterLayout, PatternMaterialMapping } from "../../types"
import { MToonMaterial } from "@pixiv/three-vrm"
import { ImageMatrixPair } from "./types"
import { composeImagesToAtlas } from "./composite"
import { Color, DataTexture, FloatType, RGBAFormat, Vector3, Vector4 } from "three"
import { ParameterSemanticId } from "@xrift/mtoon-atlas"

/**
 * null 要素を有効なテクスチャの平均寸法で埋める
 * 平均値は 2 の n 乗に丸める
 *
 * @param textures - null を含む可能性のあるテクスチャ配列
 * @returns 全て有効な値で埋められたテクスチャ配列
 */
export function fillNullTexturesWithAverageDimensions(
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
 * 各チャンネル(例: MainTex, BumpMap)ごとのアトラス画像を生成する
 * 現状はMToonMaterialのみ対応
 *
 * @param materials - アトラス化対象のマテリアル配列
 * @param placements - マテリアルごとのパッキング情報配列
 * @returns スロット名をキーにしたアトラス画像のマップ
 */
export async function generateAtlasImages(
  materials: MToonMaterial[],
  placements: OffsetScale[]
): Promise<Result<AtlasImageMap, OptimizationError>>
{
  if (materials.length !== placements.length)
  {
    return err({
      type: 'INVALID_PARAMETER',
      message: 'Materials and packing infos length mismatch',
    })
  }

  const atlasMap: Partial<AtlasImageMap> = {}

  for (const slot of MTOON_TEXTURE_SLOTS)
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
      return err({
        type: 'ATLAS_GENERATION_FAILED',
        message: `Failed to generate atlas for slot ${slot}: ${atlasResult.error.message}`,
        cause: atlasResult.error,
      })
    }

    atlasMap[slot] = atlasResult.value
  }

  return ok(atlasMap as AtlasImageMap)
}


/**
 * マテリアル配列からパラメータテクスチャを生成
 *
 * DEFAULT_PARAMETER_LAYOUTに従って19種のパラメータをRGBAテクセルにパック
 * テクスチャフォーマット: slotCount x texelsPerSlot (RGBA32F)
 *
 * @param materials - MToonNodeMaterial配列
 * @param texelsPerSlot - スロットあたりのテクセル数（デフォルト: 8）
 * @returns DataTexture
 */
export function createParameterTexture(
  materials: MToonMaterial[],
  texelsPerSlot: number = 8
): Result<DataTexture, OptimizationError>
{
  if (materials.length === 0)
  {
    return err({
      type: 'PARAMETER_TEXTURE_FAILED',
      message: 'No materials to pack',
    })
  }

  const slotCount = materials.length
  const width = texelsPerSlot
  const height = slotCount

  // RGBA32F テクスチャデータ（Float32Array）
  const data = new Float32Array(width * height * 4)

  // 各マテリアル（スロット）について処理
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++)
  {
    const material = materials[slotIndex]

    // 各パラメータをレイアウトに従ってパック
    for (const layout of PARAMETER_LAYOUT)
    {
      const value = extractParameterValue(material, layout.id)
      packParameterValue(data, slotIndex, layout, value, texelsPerSlot)
    }
  }

  // DataTextureを作成
  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType)
  texture.needsUpdate = true

  return ok(texture)
}


/**
 * パラメータ値をテクスチャデータにパック
 *
 * @param data - テクスチャデータ配列
 * @param slotIndex - スロットインデックス
 * @param layout - パラメータレイアウト
 * @param value - パラメータ値
 * @param texelsPerSlot - スロットあたりのテクセル数
 */
function packParameterValue(
  data: Float32Array,
  slotIndex: number,
  layout: ParameterLayout,
  value: Vector3 | Vector4 | number,
  texelsPerSlot: number
): void
{
  const texelIndex = layout.texel
  const pixelIndex = slotIndex * texelsPerSlot + texelIndex
  const baseOffset = pixelIndex * 4

  // 値を配列化
  let values: number[]
  if (typeof value === 'number')
  {
    values = [value]
  }
  else if ('w' in value)
  {
    values = [value.x, value.y, value.z, value.w]
  }
  else
  {
    values = [value.x, value.y, value.z]
  }

  // チャンネルにパック
  for (let i = 0; i < layout.channels.length; i++)
  {
    const channel = layout.channels[i]
    const channelOffset =
      channel === 'r' ? 0 : channel === 'g' ? 1 : channel === 'b' ? 2 : 3
    data[baseOffset + channelOffset] = values[i] ?? 0
  }
}


/**
 * MToonMaterialからパラメータ値を抽出
 *
 * @param material - MToonMaterial
 * @param semanticId - パラメータのセマンティクスID
 * @returns パラメータ値（Vector3, Vector4, number のいずれか）
 */
function extractParameterValue(
  material: MToonMaterial,
  semanticId: ParameterSemanticId
): Vector3 | Vector4 | number
{
  switch (semanticId)
  {
    case 'baseColor':
      return colorToVector3(material.color ?? new Color(1, 1, 1))
    case 'shadeColor':
      return colorToVector3(material.shadeColorFactor ?? new Color(0, 0, 0))
    case 'emissiveColor':
      return colorToVector3(material.emissive ?? new Color(0, 0, 0))
    case 'emissiveIntensity':
      return material.emissiveIntensity ?? 0
    case 'shadingShift':
      return material.shadingShiftFactor ?? 0
    case 'shadingShiftTextureScale':
      return material.shadingShiftTextureScale ?? 1
    case 'shadingToony':
      return material.shadingToonyFactor ?? 0.9
    case 'rimLightingMix':
      return material.rimLightingMixFactor ?? 1
    case 'matcapColor':
      return colorToVector3(material.matcapFactor ?? new Color(1, 1, 1))
    case 'outlineWidth':
      return material.outlineWidthFactor ?? 0
    case 'outlineColor':
      return colorToVector3(material.outlineColorFactor ?? new Color(0, 0, 0))
    case 'outlineLightingMix':
      return material.outlineLightingMixFactor ?? 1
    case 'parametricRimColor':
      return colorToVector3(
        material.parametricRimColorFactor ?? new Color(0, 0, 0)
      )
    case 'parametricRimLift':
      return material.parametricRimLiftFactor ?? 0
    case 'parametricRimFresnelPower':
      return material.parametricRimFresnelPowerFactor ?? 5
    case 'uvAnimationScrollX':
      return 0 // TODO: MToonMaterialのプロパティ確認
    case 'uvAnimationScrollY':
      return 0 // TODO: MToonMaterialのプロパティ確認
    case 'uvAnimationRotation':
      return 0 // TODO: MToonMaterialのプロパティ確認
    case 'normalScale':
      return new Vector4(1, 1, 0, 0) // x, y のみ使用
    default:
      return 0
  }
}

/**
 * Three.js Color を Vector3 に変換
 */
function colorToVector3(color: Color): Vector3
{
  return new Vector3(color.r, color.g, color.b)
}

function correctTexturesForPack()
{
  // テクスチャ組み合わせパターンを抽出してマッピングを構築
  const patternMappings = buildPatternMaterialMappings(materials)

  // パターンごとのテクスチャディスクリプタを収集
  const textureDescriptors = patternMappings.map(m => m.textureDescriptor)

  // width/heightが0のものを有効なテクスチャの平均値で埋める
  const texturesToPack = fillNullTexturesWithAverageDimensions(
    textureDescriptors.map(d => (d.width > 0 && d.height > 0) ? d : null)
  )
}
