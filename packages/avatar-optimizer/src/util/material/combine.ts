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
import type { CombinedMeshResult, CombineMaterialOptions } from './types'

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
  options: CombineMaterialOptions = {},
  excludedMeshes?: Set<Mesh>,
): Result<CombinedMeshResult, OptimizationError> {
  return safeTry(function* () {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    const materials = Array.from(materialMeshMap.keys())

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

    for (const [material, meshList] of materialMeshMap) {
      const slotIndex = materialSlotIndex.get(material) ?? 0
      for (const mesh of meshList) {
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

    return ok({
      mesh: combinedMesh,
      material: atlasMaterial,
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
