/**
 * MToonマテリアル結合モジュール
 *
 * 複数のMToonMaterialをレンダーモードごとにグループ化し、
 * 各グループをMToonAtlasMaterialに結合してドローコールを削減します。
 *
 * レンダーモード:
 * - opaque: 不透明（transparent === false && alphaTest === 0）
 * - alphaTest: MASKモード（alphaTest > 0）
 * - transparent: 半透明（transparent === true）
 */

import { MToonMaterial } from '@pixiv/three-vrm'
import type {
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
  ParameterTextureDescriptor,
} from '@xrift/mtoon-atlas'
import { MToonAtlasMaterial } from '@xrift/mtoon-atlas'
import { err, ok, Result, safeTry } from 'neverthrow'
import { BufferGeometry, DataTexture, Mesh, SkinnedMesh } from 'three'
import type { OptimizationError } from '../../types'
import { mergeGeometriesWithSlotAttribute } from '../mesh/merge-mesh'
import { createParameterTexture } from '../texture'
import { getRenderMode } from './index'
import type {
  CombinedMeshResult,
  CombineMaterialOptions,
  MaterialInfo,
  MaterialSlotInfo,
  MeshGroup,
  OutlineWidthMode,
  RenderMode,
} from './types'

/**
 * デフォルトオプション
 */
const DEFAULT_OPTIONS: Required<CombineMaterialOptions> = {
  atlasSize: 2048,
  slotAttributeName: 'mtoonMaterialSlot',
  texelsPerSlot: 9,
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
        renderMode: getRenderMode(material),
      })
    }
  } else {
    materialInfos = input
  }

  return combineMToonMaterialsInternal(materialInfos, options, excludedMeshes)
}

/**
 * MaterialInfoをレンダーモードでグループ化
 */
function groupMaterialInfoByRenderMode(
  materialInfos: MaterialInfo[],
): Map<RenderMode, MaterialInfo[]> {
  const groups = new Map<RenderMode, MaterialInfo[]>()

  for (const info of materialInfos) {
    const mode = info.renderMode
    if (!groups.has(mode)) {
      groups.set(mode, [])
    }
    groups.get(mode)!.push(info)
  }

  return groups
}

/**
 * 単一グループの結合結果
 */
interface SingleGroupResult {
  mesh: Mesh | null
  material: MToonAtlasMaterial
  outlineMesh?: Mesh
  outlineMaterial?: MToonAtlasMaterial
  materialSlotIndex: Map<MToonMaterial, number>
  meshCount: number
  materialCount: number
}

/**
 * 単一グループのマテリアル結合処理
 */
function processSingleGroup(
  materialInfos: MaterialInfo[],
  opts: Required<CombineMaterialOptions>,
  excludedMeshes: Set<Mesh> | undefined,
  renderMode: RenderMode,
): Result<SingleGroupResult, OptimizationError> {
  return safeTry(function* () {
    const materials = materialInfos.map((info) => info.material)

    // アウトライン情報を収集
    let hasAnyOutline = false
    let outlineWidthMode: OutlineWidthMode = 'worldCoordinates'
    for (const info of materialInfos) {
      if (info.hasOutline) {
        hasAnyOutline = true
        outlineWidthMode = info.outlineWidthMode
        break
      }
    }

    // パラメータテクスチャ生成
    const parameterTexture = yield* createParameterTexture(
      materials,
      opts.texelsPerSlot,
    )

    // マテリアルとメッシュのマッピング
    const materialSlotIndex = new Map<MToonMaterial, number>()
    materials.forEach((mat, index) => {
      materialSlotIndex.set(mat, index)
    })

    // ジオメトリ結合用マップの構築
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

    // MToonAtlasMaterialの作成（excludedMeshes用にも必要なので先に作成）
    const atlasMaterial = createMToonAtlasMaterial(
      materials[0],
      parameterTexture,
      materials.length,
      opts.texelsPerSlot,
      opts.slotAttributeName,
      renderMode,
    )

    // マージ対象がない場合はマテリアルのみ返す（excludedMeshes専用グループ）
    if (meshesForMerge.length === 0) {
      return ok({
        mesh: null,
        material: atlasMaterial,
        outlineMesh: undefined,
        outlineMaterial: undefined,
        materialSlotIndex,
        meshCount: 0,
        materialCount: materials.length,
      })
    }

    // マテリアルスロットアトリビュートを追加してジオメトリ結合
    const mergedGeometries = yield* mergeGeometriesWithSlotAttribute(
      meshesForMerge,
      meshToSlotIndex,
      opts.slotAttributeName,
    )
    const mergedGeometry = mergedGeometries[0]

    // 結合メッシュの作成
    const { mesh: combinedMesh } = createCombinedMesh(
      mergedGeometry,
      atlasMaterial,
      meshesForMerge,
      `CombinedMToonMesh_${renderMode}`,
    )

    // アウトラインメッシュの作成
    let outlineMesh: Mesh | undefined
    let outlineMaterial: MToonAtlasMaterial | undefined

    if (hasAnyOutline) {
      outlineMaterial = atlasMaterial.createOutlineMaterial(
        outlineWidthMode === 'screenCoordinates'
          ? 'screenCoordinates'
          : 'worldCoordinates',
      )

      const outlineResult = createCombinedMesh(
        mergedGeometry,
        outlineMaterial,
        meshesForMerge,
        `CombinedMToonMesh_${renderMode}_Outline`,
      )
      outlineMesh = outlineResult.mesh
      outlineMesh.renderOrder = combinedMesh.renderOrder - 1
    }

    return ok({
      mesh: combinedMesh,
      material: atlasMaterial,
      outlineMesh,
      outlineMaterial,
      materialSlotIndex,
      meshCount: meshesForMerge.length,
      materialCount: materials.length,
    })
  })
}

/**
 * 結合メッシュを作成
 */
function createCombinedMesh(
  geometry: BufferGeometry,
  material: MToonAtlasMaterial,
  sourceMeshes: Mesh[],
  name: string,
): { mesh: Mesh; firstSkinnedMesh: SkinnedMesh | undefined } {
  const firstSkinnedMesh = sourceMeshes.find(
    (mesh): mesh is SkinnedMesh => mesh instanceof SkinnedMesh,
  )

  let mesh: Mesh
  if (firstSkinnedMesh) {
    const skinnedMesh = new SkinnedMesh(geometry, material)
    skinnedMesh.name = name

    if (geometry.userData.skeleton) {
      const skeleton = geometry.userData.skeleton
      const identityMatrix = firstSkinnedMesh.matrixWorld.clone().identity()
      skinnedMesh.bind(skeleton, identityMatrix)
    } else if (firstSkinnedMesh.skeleton) {
      const identityMatrix = firstSkinnedMesh.matrixWorld.clone().identity()
      skinnedMesh.bind(firstSkinnedMesh.skeleton, identityMatrix)
    }

    mesh = skinnedMesh
  } else {
    mesh = new Mesh(geometry, material)
    mesh.name = name
  }

  return { mesh, firstSkinnedMesh }
}

/**
 * 内部実装: MaterialInfo配列を処理（レンダーモードごとにグループ化）
 */
function combineMToonMaterialsInternal(
  materialInfos: MaterialInfo[],
  options: CombineMaterialOptions,
  excludedMeshes?: Set<Mesh>,
): Result<CombinedMeshResult, OptimizationError> {
  return safeTry(function* () {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    // レンダーモードでグループ化
    const groupedInfos = groupMaterialInfoByRenderMode(materialInfos)

    // 各グループを処理
    const groups = new Map<RenderMode, MeshGroup>()
    const materialSlotIndex = new Map<MToonMaterial, MaterialSlotInfo>()

    let totalMeshCount = 0
    let totalMaterialCount = 0

    // レンダーモードの処理順序（描画順に影響）
    const renderModeOrder: RenderMode[] = ['opaque', 'alphaTest', 'transparent']

    for (const renderMode of renderModeOrder) {
      const infos = groupedInfos.get(renderMode)
      if (!infos || infos.length === 0) continue

      const result = yield* processSingleGroup(
        infos,
        opts,
        excludedMeshes,
        renderMode,
      )

      groups.set(renderMode, {
        mesh: result.mesh,
        material: result.material,
        outlineMesh: result.outlineMesh,
        outlineMaterial: result.outlineMaterial,
      })

      // マテリアルスロット情報を統合
      for (const [mat, slotIndex] of result.materialSlotIndex) {
        materialSlotIndex.set(mat, { renderMode, slotIndex })
      }

      totalMeshCount += result.meshCount
      totalMaterialCount += result.materialCount
    }

    if (groups.size === 0) {
      return err({
        type: 'ASSET_ERROR',
        message: 'マージ対象のメッシュがありません',
      })
    }

    // 結果のドローコール数を計算
    // meshが存在するグループにつき1ドローコール + アウトラインがあれば+1
    let resultDrawCalls = 0
    for (const group of groups.values()) {
      if (group.mesh) resultDrawCalls += 1
      if (group.outlineMesh) resultDrawCalls += 1
    }

    return ok({
      groups,
      materialSlotIndex,
      statistics: {
        originalMeshCount: totalMeshCount,
        originalMaterialCount: totalMaterialCount,
        reducedDrawCalls: totalMaterialCount - resultDrawCalls,
      },
    })
  })
}

/**
 * MToonAtlasMaterialを作成
 *
 * 代表マテリアルのアトラス化されたテクスチャを使用
 * パラメータテクスチャを設定
 */
function createMToonAtlasMaterial(
  representativeMaterial: MToonMaterial,
  parameterTexture: DataTexture,
  slotCount: number,
  texelsPerSlot: number,
  slotAttributeName: string,
  renderMode: RenderMode,
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

  // MToonAtlasMaterialを作成
  const material = new MToonAtlasMaterial({
    parameterTexture: parameterTextureDescriptor,
    slotAttribute,
  })

  // レンダーモードに応じた設定
  if (renderMode === 'transparent') {
    material.transparent = true
    material.depthWrite = false
  } else if (renderMode === 'alphaTest') {
    material.transparent = false
    material.alphaTest = representativeMaterial.alphaTest
  } else {
    material.transparent = false
  }

  return material
}
