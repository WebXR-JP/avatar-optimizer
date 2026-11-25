import type { VRM } from '@pixiv/three-vrm'
import { err, ok, ResultAsync, safeTry } from 'neverthrow'
import { BufferAttribute, Mesh } from 'three'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import {
  compressAtlasTexturesToKtx2,
  resolveKtx2LoaderForOptimization,
} from './process/compress-ktx2'
import { generateAtlasImagesFromPatterns } from './process/gen-atlas'
import { migrateVRM0ToVRM1 } from './process/migrate-vrm'
import { buildPatternMaterialMappings, pack } from './process/packing'
import { applyPlacementsToGeometries } from './process/set-uv'
import { simplifyMeshes, SimplifyStatistics } from './process/simplify'
import {
  MToonLikeMaterial,
  OffsetScale,
  OptimizationError,
  OptimizeModelOptions,
} from './types'
import {
  assignAtlasTexturesToMaterial,
  CombinedMeshResult,
  combineMToonMaterials as combineMeshAndMaterial,
  getMToonMaterialInfoFromObject3D,
  getRenderOrderForMode,
  isMToonLikeMaterial,
} from './util/material'
import { deleteMesh } from './util/mesh/deleter'
import {
  collectExpressionMeshes,
  collectNonSkinnedMeshes,
  createEmptyCombinedMeshResult,
  hasAtlasedMaterial,
} from './util/optimize-helpers'
import { optimizeSkeletons } from './util/skeleton'

/**
 * 受け取ったThree.jsオブジェクトのツリーのメッシュ及びそのマテリアルを走査し、
 * Three.jsの複数MToonNodeMaterialをチャンネルごとにテクスチャパッキング
 * アトラス化したテクスチャを各マテリアルに設定する
 * 対応するメッシュのUVをパッキング結果に基づき修正する
 * 最後にマテリアルを統合してドローコール数を削減する
 *
 * @param vrm - 最適化対象のVRMオブジェクト
 * @param options - 最適化オプション
 * @returns 最適化結果（統合メッシュ情報を含む）
 */
export function optimizeModel(
  vrm: VRM,
  options: OptimizeModelOptions = {},
): ResultAsync<CombinedMeshResult, OptimizationError> {
  return safeTry(async function* () {
    const rootNode = vrm.scene

    // SpringBone・Humanoid を初期姿勢（バインドポーズ）にリセット
    // アニメーション再生中や物理演算による変形がメッシュ統合・マイグレーションに混入しないようにする
    vrm.springBoneManager?.reset()
    vrm.humanoid?.resetNormalizedPose?.()
    vrm.humanoid?.resetRawPose?.()
    rootNode.updateMatrixWorld(true)

    // モデルのマテリアル集計（アウトライン情報を含む）
    const materialInfoResult = getMToonMaterialInfoFromObject3D(rootNode)

    const excludedMeshes = new Set<Mesh>()
    let simplifyStats: SimplifyStatistics | undefined
    let combineResult: CombinedMeshResult

    if (materialInfoResult.isOk()) {
      const materialInfos = materialInfoResult.value
      const materials = materialInfos.map((info) => info.material)

      // TSL 版（MToonNodeMaterial）のモデルに WebGL 専用の MToonAtlasMaterial を
      // 当てると WebGPURenderer で描画できなくなる。変更を加える前に止める
      if (
        !options.atlasMaterialType &&
        materials.some(
          (m) => 'isMToonNodeMaterial' in m && m.isMToonNodeMaterial,
        )
      ) {
        return err({
          type: 'INVALID_PARAMETER' as const,
          message:
            'MToonNodeMaterial を含むモデルを最適化するには atlasMaterialType に ' +
            '@webxr-jp/mtoon-atlas/nodes の MToonAtlasNodeMaterial を指定してください',
        })
      }

      // KTX2 圧縮指定時はモデルへ変更を加える前に KTX2Loader を解決できるか検証する
      let resolvedKtx2Loader: KTX2Loader | undefined
      if (options.textureCompression) {
        resolvedKtx2Loader = yield* resolveKtx2LoaderForOptimization(options)
      }

      // 後方互換性のためのMap生成
      const materialMeshMap = new Map<MToonLikeMaterial, Mesh[]>()
      for (const info of materialInfos) {
        materialMeshMap.set(info.material, info.meshes)
      }

      // マテリアルで使われてるテクスチャの組のパターンを集計
      const patternMappings = buildPatternMaterialMappings(materials)

      // パッキングレイアウトを構築
      const packLayouts = yield* await pack(patternMappings)

      // パターンごとのアトラス画像を生成
      const atlasMap = yield* generateAtlasImagesFromPatterns(
        materials,
        patternMappings,
        packLayouts.packed,
        options.atlas,
      )

      // アトラス画像をマテリアルにそれぞれアサインする
      const materialPlacementMap = new Map<MToonLikeMaterial, OffsetScale>()
      patternMappings.forEach((mapping, index) => {
        const placement = packLayouts.packed[index]
        for (const materialIndex of mapping.materialIndices) {
          const material = materials[materialIndex]
          assignAtlasTexturesToMaterial(material, atlasMap)
          materialPlacementMap.set(material, placement)
        }
      })

      // アトラス画像の配置に合わせてUVを移動する
      yield* applyPlacementsToGeometries(rootNode, materialPlacementMap)

      // 顔メッシュ（表情で使われているメッシュ）を特定
      // 簡略化とメッシュ統合から除外するメッシュのSet
      for (const mesh of collectExpressionMeshes(
        vrm.expressionManager ?? null,
        materialMeshMap,
      )) {
        excludedMeshes.add(mesh)
      }

      // 非SkinnedMeshはメッシュ統合から除外（ボーンペアレントを保持するため）
      // 注: excludedMeshesは簡略化の除外リストにも渡るため、リジッドな
      // 装飾メッシュはドローコール削減・ポリゴン削減の対象外になる。
      // 位置の正しさを優先した意図的なトレードオフ
      for (const mesh of collectNonSkinnedMeshes(materialMeshMap)) {
        excludedMeshes.add(mesh)
      }

      // メッシュ簡略化（オプションが設定されている場合）
      // UVリマッピング後、メッシュ統合前に実行
      if (options.simplify) {
        simplifyStats = yield* await simplifyMeshes(
          rootNode,
          excludedMeshes,
          options.simplify,
        )
      }

      // アトラステクスチャを KTX2 へ圧縮し、GPU 向け CompressedTexture に差し替える
      // マテリアル統合前に行うことで、統合マテリアル・アウトライン双方が同じ圧縮テクスチャを共有する
      if (options.textureCompression && resolvedKtx2Loader) {
        yield* await compressAtlasTexturesToKtx2(materialInfos, atlasMap, {
          compression: options.textureCompression,
          ktx2Loader: resolvedKtx2Loader,
        })
      }

      // 非同期処理（パッキング・簡略化・圧縮）の間にアニメーションや物理演算がボーンを
      // 動かしている可能性があるため、メッシュ統合直前にもバインドポーズへ戻す
      vrm.springBoneManager?.reset()
      vrm.humanoid?.resetNormalizedPose?.()
      vrm.humanoid?.resetRawPose?.()
      rootNode.updateMatrixWorld(true)

      // 複数のMesh及びMToonMaterialを統合してドローコール数を削減
      // レンダーモード（opaque/alphaTest/transparent）ごとに別メッシュとして結合
      combineResult = yield* combineMeshAndMaterial(
        materialInfos,
        // undefined を渡すと既定値（MToonAtlasMaterial）を上書きしてしまうため、指定時のみ渡す
        options.atlasMaterialType
          ? { materialType: options.atlasMaterialType }
          : {},
        excludedMeshes,
      )

      // excludedMeshesにもMToonAtlasMaterialを適用
      // これにより、エクスポート→インポート後も正しくレンダリングされる
      // 最初のグループからスロット属性名を取得
      const firstGroup = combineResult.groups.values().next().value
      const slotAttributeName =
        firstGroup?.material.slotAttribute?.name || 'mtoonMaterialSlot'

      for (const mesh of excludedMeshes) {
        // メッシュのマテリアルを取得
        const originalMaterial = Array.isArray(mesh.material)
          ? mesh.material[0]
          : mesh.material

        if (!isMToonLikeMaterial(originalMaterial)) continue

        // スロット情報を取得
        const slotInfo = combineResult.materialSlotIndex.get(originalMaterial)
        if (!slotInfo) continue

        // 対応するレンダーモードのグループを取得
        const group = combineResult.groups.get(slotInfo.renderMode)
        if (!group) continue

        // ジオメトリにスロット属性を追加
        const geometry = mesh.geometry
        const vertexCount = geometry.getAttribute('position').count
        const slotArray = new Float32Array(vertexCount).fill(slotInfo.slotIndex)
        geometry.setAttribute(
          slotAttributeName,
          new BufferAttribute(slotArray, 1),
        )

        // MToonAtlasMaterialを適用（同じレンダーモードのマテリアルを共有）
        mesh.material = group.material
        // 描画順も統合メッシュと同じ規則にする（再読み込み時のローダーと一致）
        mesh.renderOrder = getRenderOrderForMode(slotInfo.renderMode)
      }

      // 元のrootNodeから既存のメッシュを削除
      const meshesToRemove: Mesh[] = []
      for (const meshes of materialMeshMap.values()) {
        for (const mesh of meshes) {
          if (!excludedMeshes.has(mesh)) {
            meshesToRemove.push(mesh)
          }
        }
      }

      // 最初のメッシュの親を取得（結合後のメッシュを同じ親に追加するため）
      const firstMeshParent = meshesToRemove[0]?.parent || rootNode

      meshesToRemove.forEach((mesh) => mesh.parent?.remove(mesh))

      // バッファを削除
      for (const mesh of meshesToRemove) {
        deleteMesh(mesh)
      }

      // 各レンダーモードのメッシュをシーンに追加
      // アウトラインメッシュを先に追加することで、glTF/VRMエクスポート後も
      // 正しい描画順序を維持（ノードの順序が描画順序に影響するため）
      for (const group of combineResult.groups.values()) {
        // アウトラインを先に追加（先に描画される = 後ろに表示される）
        if (group.outlineMesh) {
          firstMeshParent.add(group.outlineMesh)
        }
        // excludedMeshes専用グループの場合はmeshがnull
        if (group.mesh) {
          firstMeshParent.add(group.mesh)
        }
      }

      // 簡略化統計を結果に追加
      if (simplifyStats) {
        combineResult.statistics.simplify = simplifyStats
      }
    } else {
      // 「MToonMaterialがない」以外のエラーは握り潰さず伝播する
      // （現状getMToonMaterialInfoFromObject3DはASSET_ERRORしか返さないが、
      // 将来内部エラーが追加された場合に静かにスキップされるのを防ぐ）
      if (materialInfoResult.error.type !== 'ASSET_ERROR') {
        yield* materialInfoResult
      }

      // 既に最適化済みか（＝同じモデルへの重複実行か）を先に判定する。
      // 重複実行では簡略化もマイグレーションも冪等ではなく、
      // 適用するたびにモデルが劣化・破壊されるため何もしない。
      const isAlreadyOptimized = hasAtlasedMaterial(rootNode)

      // MToonMaterialがない場合: アトラス化・マテリアル統合をスキップして
      // 簡略化とマイグレーションのみ実行する（エラーにはしない）
      for (const mesh of collectExpressionMeshes(
        vrm.expressionManager ?? null,
      )) {
        excludedMeshes.add(mesh)
      }

      // 簡略化は再実行のたびに頂点が減り続けるので、重複実行では行わない
      if (options.simplify && !isAlreadyOptimized) {
        simplifyStats = yield* await simplifyMeshes(
          rootNode,
          excludedMeshes,
          options.simplify,
        )
      }

      // スキップしたことを呼び出し側へ伝える。
      // エラーにはしないため、これが無いと「最適化したのに何も起きていない」
      // 状態に気づけない（後続の KTX2 圧縮も効かないまま出力される）
      combineResult = createEmptyCombinedMeshResult(
        simplifyStats,
        isAlreadyOptimized
          ? {
              reason: 'ALREADY_OPTIMIZED',
              message:
                '既に最適化済みのため、何も行いませんでした' +
                '（アトラス化・簡略化・マイグレーションはいずれも' +
                '再実行するとモデルが壊れるためスキップします）。',
            }
          : {
              reason: 'NO_MTOON_MATERIAL',
              message:
                'MToon マテリアル（MToonMaterial / MToonNodeMaterial）が見つからないため、アトラス化とマテリアル統合を' +
                'スキップしました（簡略化とマイグレーションのみ実行）。',
            },
      )
    }

    // VRM0.x -> VRM1.0 マイグレーション（メッシュ統合後に実行）
    // VRM1.0 の場合はスキップ（metaVersion === '1'）。
    // 既に最適化済みのモデル（マイグレーション無しで最適化した場合など）でも
    // 重複実行による劣化・破壊を防ぐためスキップする。
    const isVRM1 = vrm.meta?.metaVersion === '1'
    const skipAsAlreadyOptimized =
      combineResult.atlasSkipped?.reason === 'ALREADY_OPTIMIZED'

    if (options.migrateVRM0ToVRM1 && !isVRM1 && !skipAsAlreadyOptimized) {
      yield* migrateVRM0ToVRM1(vrm)
    }

    // Skeleton 統合・未使用ボーン除外（マイグレーション後に実行）
    if (!skipAsAlreadyOptimized) {
      const skeletonStats = yield* optimizeSkeletons(rootNode)
      combineResult.statistics.skeleton = skeletonStats
    }

    return ok(combineResult)
  })
}
