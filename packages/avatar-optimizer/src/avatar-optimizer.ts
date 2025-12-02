import { MToonMaterial, VRM } from '@pixiv/three-vrm'
import { ok, ResultAsync, safeTry } from 'neverthrow'
import { BufferAttribute, Mesh } from 'three'
import { generateAtlasImagesFromPatterns } from './process/gen-atlas'
import { buildPatternMaterialMappings, pack } from './process/packing'
import { applyPlacementsToGeometries } from './process/set-uv'
import { OffsetScale, OptimizationError, OptimizeModelOptions } from './types'
import {
  assignAtlasTexturesToMaterial,
  CombinedMeshResult,
  combineMToonMaterials as combineMeshAndMaterial,
  getMToonMaterialInfoFromObject3D,
} from './util/material'
import { deleteMesh } from './util/mesh/deleter'
import { migrateSkeletonVRM0ToVRM1 } from './util/skeleton'

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

    // SpringBoneを初期姿勢にリセット（マイグレーション前に物理演算の影響を排除）
    vrm.springBoneManager?.reset()

    // モデルのマテリアル集計（アウトライン情報を含む）
    const materialInfos = yield* getMToonMaterialInfoFromObject3D(rootNode)
    const materials = materialInfos.map((info) => info.material)

    // 後方互換性のためのMap生成
    const materialMeshMap = new Map<MToonMaterial, Mesh[]>()
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
    )

    // アトラス画像をマテリアルにそれぞれアサインする
    const materialPlacementMap = new Map<MToonMaterial, OffsetScale>()
    patternMappings.forEach((mapping, index) => {
      const placement = packLayouts.packed[index]
      for (const materialIndex of mapping.materialIndices) {
        const material = materials[materialIndex]
        assignAtlasTexturesToMaterial(material, atlasMap)
        materialPlacementMap.set(material, placement)
      }
    })

    // アトラス画像をマテリアルにそれぞれアサインする
    // アトラス画像の配置に合わせてUVを移動する
    yield* applyPlacementsToGeometries(rootNode, materialPlacementMap)

    // 顔メッシュ（表情で使われているメッシュ）を特定
    const excludedMeshes = new Set<Mesh>()
    if (vrm.expressionManager) {
      for (const expression of vrm.expressionManager.expressions) {
        for (const bind of expression.binds) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bindAny = bind as any

          // MorphTargetBind
          if (bindAny.primitives) {
            for (const mesh of bindAny.primitives) {
              if (mesh && mesh.isMesh) {
                excludedMeshes.add(mesh)
              }
            }
          }

          // MaterialColorBind / TextureTransformBind
          if (bindAny.material) {
            const meshes = materialMeshMap.get(bindAny.material)
            if (meshes) {
              meshes.forEach((mesh) => excludedMeshes.add(mesh))
            }
          }
        }
      }
    }

    // 複数のMesh及びMToonMaterialを統合してドローコール数を削減
    // レンダーモード（opaque/alphaTest/transparent）ごとに別メッシュとして結合
    const combineResult = yield* combineMeshAndMaterial(
      materialInfos,
      {},
      excludedMeshes,
    )

    // excludedMeshesにもMToonAtlasMaterialを適用
    // これにより、エクスポート→インポート後も正しくレンダリングされる
    // 最初のグループからスロット属性名を取得
    const firstGroup = combineResult.groups.values().next().value
    const slotAttributeName = firstGroup?.material.slotAttribute?.name || 'mtoonMaterialSlot'

    for (const mesh of excludedMeshes) {
      // メッシュのマテリアルを取得
      const originalMaterial = Array.isArray(mesh.material)
        ? mesh.material[0]
        : mesh.material

      if (!(originalMaterial instanceof MToonMaterial)) continue

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
      geometry.setAttribute(slotAttributeName, new BufferAttribute(slotArray, 1))

      // MToonAtlasMaterialを適用（同じレンダーモードのマテリアルを共有）
      mesh.material = group.material
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

    // VRM0.x -> VRM1.0 スケルトンマイグレーション（メッシュ統合後に実行）
    if (options.migrateVRM0ToVRM1) {
      yield* migrateSkeletonVRM0ToVRM1(rootNode)

      // SpringBoneの初期状態を再設定（ボーン変換後の状態を記録）
      vrm.springBoneManager?.setInitState()
    }

    return ok(combineResult)
  })
}
