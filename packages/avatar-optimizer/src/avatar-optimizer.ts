import { ok, ResultAsync, safeTry } from "neverthrow"
import { Object3D } from "three"
import { assignAtlasTexturesToMaterial, CombinedMeshResult, combineMToonMaterials, getMToonMaterialsFromObject3D } from "./util/material"
import { OffsetScale, OptimizationError } from "./types"
import { MToonMaterial } from "@pixiv/three-vrm"
import { buildPatternMaterialMappings, pack } from "./process/packing"
import { applyPlacementsToGeometries } from "./process/set-uv"
import { generateAtlasImagesFromPatterns } from "./process/gen-atlas"

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
    const materials = yield* getMToonMaterialsFromObject3D(rootNode)

    // マテリアルで使われてるテクスチャの組のパターンを集計
    const patternMappings = buildPatternMaterialMappings(materials)

    // パッキングレイアウトを構築
    const packLayouts = yield* await pack(patternMappings)

    // パターンごとのアトラス画像を生成
    const atlasMap = yield* generateAtlasImagesFromPatterns(
      materials,
      patternMappings,
      packLayouts.packed
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

    yield* applyPlacementsToGeometries(rootNode, materialPlacementMap)

    // マテリアル結合処理：複数のMToonNodeMaterialを統合してドローコール数を削減
    const combineResult = yield* combineMToonMaterials(rootNode)

    return ok(combineResult)
  })
}
