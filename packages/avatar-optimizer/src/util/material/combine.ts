/**
 * MToonマテリアル結合モジュール
 *
 * 複数のMToonMaterialを単一のMToonInstancingMaterialに結合し、
 * ドローコールを削減します。
 *
 * 主な処理:
 * 1. マテリアルパラメータをパラメータテクスチャにパック
 * 2. テクスチャをアトラス化
 * 3. ジオメトリを結合してスロット属性を追加
 * 4. MToonInstancingMaterialを作成
 */

import { MToonMaterial } from '@pixiv/three-vrm'
import type {
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
  ParameterTextureDescriptor,
} from '@xrift/mtoon-atlas'
import { MToonAtlasMaterial } from '@xrift/mtoon-atlas'
import { err, ok, Result, safeTry } from 'neverthrow'
import { DataTexture, Mesh, SkinnedMesh } from 'three'
import type { OptimizationError } from '../../types'
import { mergeGeometriesWithSlotAttribute } from '../mesh/merge-mesh'
import { createParameterTexture } from '../texture'
import type { CombinedMeshResult, CombineMaterialOptions, MaterialInfo, OutlineWidthMode } from './types'

/**
 * デフォルトオプション
 */
const DEFAULT_OPTIONS: Required<CombineMaterialOptions> = {
  atlasSize: 2048,
  slotAttributeName: 'mtoonMaterialSlot',
  texelsPerSlot: 8,
}

/**
 * 複数のMToonMaterialを単一のMToonAtlasMaterialに結合
 * Meshは統合して元のマテリアル識別用の頂点アトリビュートを埋め込む
 *
 * @param materialMeshMap - 最適化対象のマテリアルと、それを利用するMeshの組のデータ
 * @param options - 結合オプション
 * @returns 結合されたメッシュと統計情報
 */
export function combineMToonMaterials(
  materialMeshMap: Map<MToonMaterial, Mesh[]>,
  options?: CombineMaterialOptions,
  excludedMeshes?: Set<Mesh>,
): Result<CombinedMeshResult, OptimizationError>

/**
 * MaterialInfo配列から複数のMToonMaterialを単一のMToonAtlasMaterialに結合
 * アウトライン情報を使用してアウトラインメッシュも生成
 *
 * @param materialInfos - マテリアル情報の配列（アウトライン情報を含む）
 * @param options - 結合オプション
 * @returns 結合されたメッシュと統計情報（アウトラインメッシュを含む）
 */
export function combineMToonMaterials(
  materialInfos: MaterialInfo[],
  options?: CombineMaterialOptions,
  excludedMeshes?: Set<Mesh>,
): Result<CombinedMeshResult, OptimizationError>

export function combineMToonMaterials(
  input: Map<MToonMaterial, Mesh[]> | MaterialInfo[],
  options: CombineMaterialOptions = {},
  excludedMeshes?: Set<Mesh>,
): Result<CombinedMeshResult, OptimizationError> {
  // MaterialInfo[]形式に統一
  let materialInfos: MaterialInfo[]
  if (input instanceof Map) {
    // 旧API: Map<MToonMaterial, Mesh[]>からMaterialInfo[]に変換
    materialInfos = []
    for (const [material, meshes] of input) {
      materialInfos.push({
        material,
        meshes,
        hasOutline: material.outlineWidthMode !== 'none',
        outlineWidthMode: material.outlineWidthMode as OutlineWidthMode,
      })
    }
  } else {
    materialInfos = input
  }

  return combineMToonMaterialsInternal(materialInfos, options, excludedMeshes)
}

/**
 * 内部実装: MaterialInfo配列を処理
 */
function combineMToonMaterialsInternal(
  materialInfos: MaterialInfo[],
  options: CombineMaterialOptions,
  excludedMeshes?: Set<Mesh>,
): Result<CombinedMeshResult, OptimizationError> {
  return safeTry(function* () {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    const materials = materialInfos.map((info) => info.material)

    // アウトライン情報を収集
    // 最初のアウトライン有効なマテリアルのモードを全体に適用
    let hasAnyOutline = false
    let outlineWidthMode: OutlineWidthMode = 'worldCoordinates'
    for (const info of materialInfos) {
      if (info.hasOutline) {
        hasAnyOutline = true
        outlineWidthMode = info.outlineWidthMode
        break
      }
    }

    // 2. パラメータテクスチャ生成
    const parameterTexture = yield* createParameterTexture(
      materials,
      opts.texelsPerSlot,
    )

    // 3. マテリアルとメッシュのマッピング
    // 各マテリアルに対応するメッシュを集める
    const materialSlotIndex = new Map<MToonMaterial, number>()

    // マテリアルをスロットインデックスにマッピング
    materials.forEach((mat, index) => {
      materialSlotIndex.set(mat, index)
    })

    // 4. ジオメトリ結合用マップの構築
    const meshToSlotIndex = new Map<Mesh, number>()
    const meshesForMerge: Mesh[] = []

    for (const info of materialInfos) {
      const slotIndex = materialSlotIndex.get(info.material) ?? 0
      for (const mesh of info.meshes) {
        if (excludedMeshes?.has(mesh)) continue

        meshToSlotIndex.set(mesh, slotIndex)
        meshesForMerge.push(mesh)
      }
    }

    if (meshesForMerge.length === 0) {
      return err({
        type: 'ASSET_ERROR',
        message: 'マージ対象のメッシュがありません',
      })
    }

    // 5. マテリアルスロットアトリビュートを追加してジオメトリ結合
    const mergedGeometries = yield* mergeGeometriesWithSlotAttribute(
      meshesForMerge,
      meshToSlotIndex,
      opts.slotAttributeName,
    )
    const mergedGeometry = mergedGeometries[0]

    // 6. MToonAtlasMaterialの作成
    const atlasMaterial = createMToonAtlasMaterial(
      materials[0], // 代表マテリアルからアトラス化されたテクスチャを取得
      parameterTexture,
      materials.length, // スロット数
      opts.texelsPerSlot, // テクセル数
      opts.slotAttributeName,
    )

    // 7. 結合メッシュの作成
    // SkinnedMeshが含まれているかチェック
    const firstSkinnedMesh = meshesForMerge.find(
      (mesh): mesh is SkinnedMesh => mesh instanceof SkinnedMesh,
    )

    let combinedMesh: Mesh
    if (firstSkinnedMesh) {
      // SkinnedMeshとして作成
      const skinnedMesh = new SkinnedMesh(mergedGeometry, atlasMaterial)
      skinnedMesh.name = 'CombinedMToonMesh'

      // 統合されたスケルトンを使用
      if (mergedGeometry.userData.skeleton) {
        const skeleton = mergedGeometry.userData.skeleton

        // bindMatrixは単位行列（Identity）を使用する
        // merge-mesh.tsで各メッシュのbindMatrixを適用済みのため、
        // 頂点はすでにスケルトン空間（bindMatrix適用後の空間）にある
        const identityMatrix = firstSkinnedMesh.matrixWorld.clone().identity()
        skinnedMesh.bind(skeleton, identityMatrix)
      }
      // フォールバック：最初のSkinnedMeshからskeletonをコピー（通常はここには来ない）
      else if (firstSkinnedMesh.skeleton) {
        const identityMatrix = firstSkinnedMesh.matrixWorld.clone().identity()
        skinnedMesh.bind(firstSkinnedMesh.skeleton, identityMatrix)
      }

      combinedMesh = skinnedMesh
    } else {
      // 通常のMeshとして作成
      combinedMesh = new Mesh(mergedGeometry, atlasMaterial)
      combinedMesh.name = 'CombinedMToonMesh'
    }

    // 8. アウトラインメッシュの作成（アウトラインが必要な場合）
    let outlineMesh: Mesh | undefined
    let outlineMaterial: MToonAtlasMaterial | undefined

    if (hasAnyOutline) {
      // アウトライン用マテリアルを作成
      outlineMaterial = atlasMaterial.createOutlineMaterial(
        outlineWidthMode === 'screenCoordinates' ? 'screenCoordinates' : 'worldCoordinates',
      )

      // アウトライン用メッシュを作成（ジオメトリは共有）
      if (firstSkinnedMesh) {
        const outlineSkinnedMesh = new SkinnedMesh(mergedGeometry, outlineMaterial)
        outlineSkinnedMesh.name = 'CombinedMToonMesh_Outline'
        // アウトラインは通常メッシュより先に描画（後ろに配置されるように）
        outlineSkinnedMesh.renderOrder = combinedMesh.renderOrder - 1

        // スケルトンをバインド
        if (mergedGeometry.userData.skeleton) {
          const skeleton = mergedGeometry.userData.skeleton
          const identityMatrix = firstSkinnedMesh.matrixWorld.clone().identity()
          outlineSkinnedMesh.bind(skeleton, identityMatrix)
        } else if (firstSkinnedMesh.skeleton) {
          const identityMatrix = firstSkinnedMesh.matrixWorld.clone().identity()
          outlineSkinnedMesh.bind(firstSkinnedMesh.skeleton, identityMatrix)
        }

        outlineMesh = outlineSkinnedMesh
      } else {
        outlineMesh = new Mesh(mergedGeometry, outlineMaterial)
        outlineMesh.name = 'CombinedMToonMesh_Outline'
        outlineMesh.renderOrder = combinedMesh.renderOrder - 1
      }
    }

    return ok({
      mesh: combinedMesh,
      material: atlasMaterial,
      outlineMesh,
      outlineMaterial,
      materialSlotIndex,
      statistics: {
        originalMeshCount: meshesForMerge.length,
        originalMaterialCount: materials.length,
        reducedDrawCalls: materials.length - 1, // 元のドローコール数 - 1（統合後）
      },
    })
  })
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
function createMToonAtlasMaterial(
  representativeMaterial: MToonMaterial,
  parameterTexture: DataTexture,
  slotCount: number,
  texelsPerSlot: number,
  slotAttributeName: string,
): MToonAtlasMaterial {
  // アトラス化されたテクスチャセットを構築
  const atlasedTextures: AtlasedTextureSet = {}

  // 代表マテリアルからアトラス化テクスチャを取得
  if (representativeMaterial.map) {
    atlasedTextures.baseColor = representativeMaterial.map
  }
  if (representativeMaterial.shadeMultiplyTexture) {
    atlasedTextures.shade = representativeMaterial.shadeMultiplyTexture
  }
  if (representativeMaterial.shadingShiftTexture) {
    atlasedTextures.shadingShift = representativeMaterial.shadingShiftTexture
  }
  if (representativeMaterial.normalMap) {
    atlasedTextures.normal = representativeMaterial.normalMap
  }
  if (representativeMaterial.emissiveMap) {
    atlasedTextures.emissive = representativeMaterial.emissiveMap
  }
  if (representativeMaterial.matcapTexture) {
    atlasedTextures.matcap = representativeMaterial.matcapTexture
  }
  if (representativeMaterial.rimMultiplyTexture) {
    atlasedTextures.rim = representativeMaterial.rimMultiplyTexture
  }
  if (representativeMaterial.uvAnimationMaskTexture) {
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
  const material = new MToonAtlasMaterial({
    parameterTexture: parameterTextureDescriptor,
    slotAttribute,
  })

  return material
}
