/**
 * MToonマテリアル結合モジュール
 *
 * 複数のMToonNodeMaterialを単一のMToonInstancingMaterialに結合し、
 * ドローコールを削減します。
 *
 * 主な処理:
 * 1. マテリアルパラメータをパラメータテクスチャにパック
 * 2. テクスチャをアトラス化
 * 3. ジオメトリを結合してスロット属性を追加
 * 4. MToonInstancingMaterialを作成
 */

import {
  BufferGeometry,
  Color,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  Mesh,
  Object3D,
  RGBAFormat,
  Vector3,
  Vector4,
} from 'three'
import { MToonNodeMaterial } from '@pixiv/three-vrm-materials-mtoon/nodes'
import { MToonInstancingMaterial } from '../../../mtoon-atlas/dist'
import type {
  ParameterTextureDescriptor,
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
} from '../../../mtoon-atlas/dist'
import { err, ok, Result } from 'neverthrow'
import type {
  CombineError,
  CombinedMeshResult,
  CombineMaterialOptions,
} from './types'

/**
 * デフォルトオプション
 */
const DEFAULT_OPTIONS: Required<CombineMaterialOptions> = {
  atlasSize: 2048,
  slotAttributeName: 'mtoonMaterialSlot',
  texelsPerSlot: 8,
}

/**
 * MToonパラメータのセマンティクスID
 * mtoon-instancing の DEFAULT_PARAMETER_LAYOUT に対応
 */
type ParameterSemanticId =
  | 'baseColor'
  | 'shadeColor'
  | 'emissiveColor'
  | 'emissiveIntensity'
  | 'shadingShift'
  | 'shadingShiftTextureScale'
  | 'shadingToony'
  | 'rimLightingMix'
  | 'matcapColor'
  | 'outlineWidth'
  | 'outlineColor'
  | 'outlineLightingMix'
  | 'parametricRimColor'
  | 'parametricRimLift'
  | 'parametricRimFresnelPower'
  | 'uvAnimationScrollX'
  | 'uvAnimationScrollY'
  | 'uvAnimationRotation'
  | 'normalScale'

/**
 * パラメータのパッキングレイアウト定義
 * mtoon-instancing の DEFAULT_PARAMETER_LAYOUT と同じ構造
 */
interface ParameterLayout
{
  id: ParameterSemanticId
  texel: number
  channels: readonly ('r' | 'g' | 'b' | 'a')[]
}

/**
 * デフォルトパラメータレイアウト
 * mtoon-instancing/src/types.ts の DEFAULT_PARAMETER_LAYOUT と同一
 */
const PARAMETER_LAYOUT: readonly ParameterLayout[] = [
  { id: 'baseColor', texel: 0, channels: ['r', 'g', 'b'] },
  { id: 'shadingShift', texel: 0, channels: ['a'] },
  { id: 'shadeColor', texel: 1, channels: ['r', 'g', 'b'] },
  { id: 'shadingShiftTextureScale', texel: 1, channels: ['a'] },
  { id: 'emissiveColor', texel: 2, channels: ['r', 'g', 'b'] },
  { id: 'emissiveIntensity', texel: 2, channels: ['a'] },
  { id: 'matcapColor', texel: 3, channels: ['r', 'g', 'b'] },
  { id: 'outlineWidth', texel: 3, channels: ['a'] },
  { id: 'outlineColor', texel: 4, channels: ['r', 'g', 'b'] },
  { id: 'outlineLightingMix', texel: 4, channels: ['a'] },
  { id: 'parametricRimColor', texel: 5, channels: ['r', 'g', 'b'] },
  { id: 'parametricRimLift', texel: 5, channels: ['a'] },
  { id: 'parametricRimFresnelPower', texel: 6, channels: ['r'] },
  { id: 'shadingToony', texel: 6, channels: ['g'] },
  { id: 'rimLightingMix', texel: 6, channels: ['b'] },
  { id: 'uvAnimationRotation', texel: 6, channels: ['a'] },
  { id: 'normalScale', texel: 7, channels: ['r', 'g'] },
  { id: 'uvAnimationScrollX', texel: 7, channels: ['b'] },
  { id: 'uvAnimationScrollY', texel: 7, channels: ['a'] },
] as const

/**
 * 複数のMToonNodeMaterialを単一のMToonInstancingMaterialに結合
 *
 * @param rootNode - 最適化対象のルートノード
 * @param options - 結合オプション
 * @returns 結合されたメッシュと統計情報
 */
export function combineMToonMaterials(
  rootNode: Object3D,
  options: CombineMaterialOptions = {}
): Result<CombinedMeshResult, CombineError>
{
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // 1. マテリアル収集
  const meshes: Mesh[] = []
  rootNode.traverse((obj) =>
  {
    if (obj instanceof Mesh)
    {
      meshes.push(obj)
    }
  })

  if (meshes.length === 0)
  {
    return err({
      type: 'NO_MATERIALS_FOUND',
      message: 'No meshes found in the scene',
    })
  }

  // MToonNodeMaterialのみを抽出（重複排除）
  let materials: MToonNodeMaterial[] = []
  for (const mesh of meshes)
  {
    if (Array.isArray(mesh.material))
    {
      materials.push(
        ...(mesh.material.filter(
          (m) => m instanceof MToonNodeMaterial
        ) as MToonNodeMaterial[])
      )
    }
    else if (mesh.material instanceof MToonNodeMaterial)
    {
      materials.push(mesh.material as MToonNodeMaterial)
    }
  }
  materials = Array.from(new Set(materials))

  if (materials.length === 0)
  {
    return err({
      type: 'NO_MATERIALS_FOUND',
      message: 'No MToonNodeMaterial found in the scene',
    })
  }

  // 2. パラメータテクスチャ生成
  const paramTexResult = createParameterTexture(materials, opts.texelsPerSlot)
  if (paramTexResult.isErr())
  {
    return err({
      type: 'PARAMETER_TEXTURE_FAILED',
      message: paramTexResult.error.message,
    })
  }
  const parameterTexture = paramTexResult.value

  // 3. マテリアルとメッシュのマッピング
  // 各マテリアルに対応するメッシュを集める
  const materialToMeshes = new Map<MToonNodeMaterial, Mesh[]>()
  const materialSlotIndex = new Map<MToonNodeMaterial, number>()

  // マテリアルをスロットインデックスにマッピング
  materials.forEach((mat, index) =>
  {
    materialSlotIndex.set(mat, index)
  })

  // メッシュをマテリアルごとにグループ化
  for (const mesh of meshes)
  {
    let material: MToonNodeMaterial | null = null

    if (Array.isArray(mesh.material))
    {
      // 複数マテリアルの場合は最初のMToonを対象
      const mtoonMaterial = mesh.material.find(
        (m) => m instanceof MToonNodeMaterial
      )
      if (mtoonMaterial instanceof MToonNodeMaterial)
      {
        material = mtoonMaterial
      }
    }
    else if (mesh.material instanceof MToonNodeMaterial)
    {
      material = mesh.material
    }

    if (material && materialSlotIndex.has(material))
    {
      if (!materialToMeshes.has(material))
      {
        materialToMeshes.set(material, [])
      }
      materialToMeshes.get(material)!.push(mesh)
    }
  }

  // 4. ジオメトリ結合用マップの構築
  const meshToSlotIndex = new Map<Mesh, number>()
  const meshesForMerge: Mesh[] = []

  for (const [material, meshList] of materialToMeshes.entries())
  {
    const slotIndex = materialSlotIndex.get(material) ?? 0
    for (const mesh of meshList)
    {
      meshToSlotIndex.set(mesh, slotIndex)
      meshesForMerge.push(mesh)
    }
  }

  if (meshesForMerge.length === 0)
  {
    return err({
      type: 'GEOMETRY_MERGE_FAILED',
      message: 'No meshes to merge',
    })
  }

  // 5. ジオメトリ結合
  const mergeResult = mergeGeometriesWithSlotAttribute(
    meshesForMerge,
    meshToSlotIndex,
    opts.slotAttributeName
  )

  if (mergeResult.isErr())
  {
    return err({
      type: 'GEOMETRY_MERGE_FAILED',
      message: mergeResult.error.message,
    })
  }

  const mergedGeometry = mergeResult.value

  // 6. MToonInstancingMaterialの作成
  const instancingMaterial = createMToonInstancingMaterial(
    materials[0], // 代表マテリアルからアトラス化されたテクスチャを取得
    parameterTexture,
    materials.length, // スロット数
    opts.texelsPerSlot, // テクセル数
    opts.slotAttributeName
  )

  // 7. 結合メッシュの作成
  const combinedMesh = new Mesh(mergedGeometry, instancingMaterial)
  combinedMesh.name = 'CombinedMToonMesh'

  return ok({
    mesh: combinedMesh,
    material: instancingMaterial,
    statistics: {
      originalMeshCount: meshes.length,
      originalMaterialCount: materials.length,
      reducedDrawCalls: materials.length - 1, // 元のドローコール数 - 1（統合後）
    },
  })
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
  materials: MToonNodeMaterial[],
  texelsPerSlot: number = 8
): Result<DataTexture, CombineError>
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
 * MToonNodeMaterialからパラメータ値を抽出
 *
 * @param material - MToonNodeMaterial
 * @param semanticId - パラメータのセマンティクスID
 * @returns パラメータ値（Vector3, Vector4, number のいずれか）
 */
function extractParameterValue(
  material: MToonNodeMaterial,
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
      return 0 // TODO: MToonNodeMaterialのプロパティ確認
    case 'uvAnimationScrollY':
      return 0 // TODO: MToonNodeMaterialのプロパティ確認
    case 'uvAnimationRotation':
      return 0 // TODO: MToonNodeMaterialのプロパティ確認
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
 * MToonInstancingMaterialを作成
 *
 * 代表マテリアルのアトラス化されたテクスチャを使用
 * パラメータテクスチャを設定
 *
 * @param representativeMaterial - テクスチャを取得するマテリアル
 * @param parameterTexture - パラメータテクスチャ
 * @param slotCount - マテリアルスロット数
 * @param texelsPerSlot - スロットあたりのテクセル数
 * @param slotAttributeName - スロット属性名
 * @returns MToonInstancingMaterial
 */
function createMToonInstancingMaterial(
  representativeMaterial: MToonNodeMaterial,
  parameterTexture: DataTexture,
  slotCount: number,
  texelsPerSlot: number,
  slotAttributeName: string
): MToonInstancingMaterial
{
  // アトラス化されたテクスチャセットを構築
  const atlasedTextures: AtlasedTextureSet = {}

  // 代表マテリアルからアトラス化テクスチャを取得
  if (representativeMaterial.map)
  {
    atlasedTextures.baseColor = representativeMaterial.map
  }
  if (representativeMaterial.shadeMultiplyTexture)
  {
    atlasedTextures.shade = representativeMaterial.shadeMultiplyTexture
  }
  if (representativeMaterial.shadingShiftTexture)
  {
    atlasedTextures.shadingShift = representativeMaterial.shadingShiftTexture
  }
  if (representativeMaterial.normalMap)
  {
    atlasedTextures.normal = representativeMaterial.normalMap
  }
  if (representativeMaterial.emissiveMap)
  {
    atlasedTextures.emissive = representativeMaterial.emissiveMap
  }
  if (representativeMaterial.matcapTexture)
  {
    atlasedTextures.matcap = representativeMaterial.matcapTexture
  }
  if (representativeMaterial.rimMultiplyTexture)
  {
    atlasedTextures.rim = representativeMaterial.rimMultiplyTexture
  }
  if (representativeMaterial.uvAnimationMaskTexture)
  {
    atlasedTextures.uvAnimationMask =
      representativeMaterial.uvAnimationMaskTexture
  }

  // パラメータテクスチャディスクリプタを構築
  const parameterTextureDescriptor: ParameterTextureDescriptor = {
    texture: parameterTexture,
    slotCount,
    texelsPerSlot,
    atlasedTextures,
  }

  // スロット属性設定
  const slotAttribute: MaterialSlotAttributeConfig = {
    name: slotAttributeName,
    description: 'Material slot index for instancing',
  }

  // MToonInstancingMaterialを作成
  const material = new MToonInstancingMaterial({
    parameterTexture: parameterTextureDescriptor,
    slotAttribute,
  })

  return material
}

/**
 * ジオメトリを結合してスロット属性を追加
 *
 * スキニング情報は一旦捨てて通常のMeshとして結合します。
 * TODO: SkinnedMeshの完全対応
 *
 * @param meshes - 結合対象のメッシュ配列
 * @param materialSlotMap - メッシュ→スロットインデックスのマップ
 * @param slotAttributeName - スロット属性名
 * @returns 結合されたBufferGeometry
 */
function mergeGeometriesWithSlotAttribute(
  meshes: Mesh[],
  materialSlotMap: Map<Mesh, number>,
  slotAttributeName: string
): Result<BufferGeometry, CombineError>
{
  if (meshes.length === 0)
  {
    return err({
      type: 'GEOMETRY_MERGE_FAILED',
      message: 'No meshes to merge',
    })
  }

  const mergedGeometry = new BufferGeometry()

  // 各属性名ごとのデータ配列を集める
  const attributeData = new Map<string, Float32Array[]>()
  const slotData: number[] = []

  let totalVertices = 0

  // 1. 各メッシュから属性データを収集
  for (const mesh of meshes)
  {
    const geometry = mesh.geometry
    if (!(geometry instanceof BufferGeometry))
    {
      continue
    }

    const slotIndex = materialSlotMap.get(mesh) ?? 0
    const vertexCount = geometry.attributes.position?.count ?? 0

    if (vertexCount === 0)
    {
      continue
    }

    // 各属性を収集
    for (const attrName in geometry.attributes)
    {
      const attr = geometry.attributes[attrName]
      if (!attr)
      {
        continue
      }

      if (!attributeData.has(attrName))
      {
        attributeData.set(attrName, [])
      }

      // ワールド座標変換を適用してクローン
      let clonedArray: Float32Array
      if (attrName === 'position')
      {
        // 位置属性はワールド座標に変換
        clonedArray = new Float32Array(attr.count * attr.itemSize)
        for (let i = 0; i < attr.count; i++)
        {
          const v = new Vector3(attr.getX(i), attr.getY(i), attr.getZ(i))
          v.applyMatrix4(mesh.matrixWorld)
          clonedArray[i * 3] = v.x
          clonedArray[i * 3 + 1] = v.y
          clonedArray[i * 3 + 2] = v.z
        }
      }
      else if (attrName === 'normal')
      {
        // 法線属性は回転のみ適用
        clonedArray = new Float32Array(attr.count * attr.itemSize)
        const normalMatrix = mesh.normalMatrix
        for (let i = 0; i < attr.count; i++)
        {
          const v = new Vector3(attr.getX(i), attr.getY(i), attr.getZ(i))
          v.applyMatrix3(normalMatrix).normalize()
          clonedArray[i * 3] = v.x
          clonedArray[i * 3 + 1] = v.y
          clonedArray[i * 3 + 2] = v.z
        }
      }
      else
      {
        // その他の属性はそのままコピー
        clonedArray = new Float32Array(attr.array)
      }

      attributeData.get(attrName)!.push(clonedArray)
    }

    // スロットインデックスを頂点数分追加
    for (let i = 0; i < vertexCount; i++)
    {
      slotData.push(slotIndex)
    }

    totalVertices += vertexCount
  }

  // 2. 属性データを結合
  for (const [attrName, arrays] of attributeData.entries())
  {
    if (arrays.length === 0)
    {
      continue
    }

    const firstArray = arrays[0]
    const itemSize =
      firstArray.length /
      (meshes[0].geometry.attributes[attrName]?.count ?? 1)

    // 全配列を連結
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
    const mergedArray = new Float32Array(totalLength)

    let offset = 0
    for (const arr of arrays)
    {
      mergedArray.set(arr, offset)
      offset += arr.length
    }

    mergedGeometry.setAttribute(
      attrName,
      new Float32BufferAttribute(mergedArray, itemSize)
    )
  }

  // 3. スロット属性を追加
  const slotArray = new Float32Array(slotData)
  mergedGeometry.setAttribute(
    slotAttributeName,
    new Float32BufferAttribute(slotArray, 1)
  )

  // 4. インデックスを結合
  const indices: number[] = []
  let vertexOffset = 0

  for (const mesh of meshes)
  {
    const geometry = mesh.geometry
    if (!(geometry instanceof BufferGeometry))
    {
      continue
    }

    const vertexCount = geometry.attributes.position?.count ?? 0
    if (vertexCount === 0)
    {
      continue
    }

    if (geometry.index)
    {
      // インデックスバッファがある場合
      for (let i = 0; i < geometry.index.count; i++)
      {
        indices.push(geometry.index.getX(i) + vertexOffset)
      }
    }
    else
    {
      // インデックスバッファがない場合は順番に生成
      for (let i = 0; i < vertexCount; i++)
      {
        indices.push(vertexOffset + i)
      }
    }

    vertexOffset += vertexCount
  }

  if (indices.length > 0)
  {
    mergedGeometry.setIndex(indices)
  }

  return ok(mergedGeometry)
}
