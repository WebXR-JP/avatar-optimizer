import { MToonMaterial } from '@pixiv/three-vrm'
import { ok, ResultAsync, safeTry } from 'neverthrow'
import { Mesh, Object3D } from 'three'
import { generateAtlasImagesFromPatterns } from './process/gen-atlas'
import { buildPatternMaterialMappings, pack } from './process/packing'
import { applyPlacementsToGeometries } from './process/set-uv'
import { OffsetScale, OptimizationError } from './types'
import
  {
    assignAtlasTexturesToMaterial,
    CombinedMeshResult,
    combineMToonMaterials as combineMeshAndMaterial,
    getMToonMaterialsWithMeshesFromObject3D,
  } from './util/material'
import { deleteMesh } from './util/mesh/deleter'

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
export function optimizeModel(
  rootNode: Object3D,
): ResultAsync<CombinedMeshResult, OptimizationError>
{
  return safeTry(async function* ()
  {
    // モデルのマテリアル集計
    const materialMeshMap =
      yield* getMToonMaterialsWithMeshesFromObject3D(rootNode)
    const materials = Array.from(materialMeshMap.keys())

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
    patternMappings.forEach((mapping, index) =>
    {
      const placement = packLayouts.packed[index]
      for (const materialIndex of mapping.materialIndices)
      {
        const material = materials[materialIndex]
        assignAtlasTexturesToMaterial(material, atlasMap)
        materialPlacementMap.set(material, placement)
      }
    })

    // アトラス画像の配置に合わせてUVを移動する
    yield* applyPlacementsToGeometries(rootNode, materialPlacementMap)

    // 複数のMesh及びMToonMaterialを統合してドローコール数を削減
    // このとき頂点アトリビュートに元のマテリアル識別用の情報を追加する
    const combineResult = yield* combineMeshAndMaterial(materialMeshMap)

    // 元のrootNodeから既存のメッシュを削除
    const meshesToRemove: Mesh[] = []
    for (const meshes of materialMeshMap.values())
    {
      meshesToRemove.push(...meshes)
    }

    // 最初のメッシュの親を取得（結合後のメッシュを同じ親に追加するため）
    const firstMeshParent = meshesToRemove[0]?.parent || rootNode

    meshesToRemove.forEach((mesh) => mesh.parent?.remove(mesh))

    // バッファを削除
    for (const mesh of meshesToRemove)
    {
      deleteMesh(mesh)
    }

    // 統合されたメッシュを元のメッシュと同じ親に追加
    firstMeshParent.add(combineResult.mesh)

    return ok(combineResult)
  })
}
