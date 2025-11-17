import { MToonNodeMaterial } from "@pixiv/three-vrm-materials-mtoon/nodes"
import { err, ok, Result } from "neverthrow"
import { Mesh, Object3D } from "three"
import { assignAtlasTexturesToMaterial, buildPatternMaterialMappings, combineMToonMaterials } from "./material"
import { packTextures } from "./texture/packing"
import { applyPlacementsToGeometries } from "./mesh/uv"
import { OffsetScale, OptimizationError } from "./types"
import { fillNullTexturesWithAverageDimensions, generateAtlasImagesFromPatterns } from "./texture"
import { MToonMaterial } from "@pixiv/three-vrm"

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
export async function optimizeModel(
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
        OptimizationError
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

    let materials: MToonMaterial[] = []
    for (const mesh of meshes)
    {
        if (Array.isArray(mesh.material))
        {
            materials.push(...(mesh.material.filter((m) => m instanceof MToonMaterial) as MToonMaterial[]))
        } else if (mesh.material instanceof MToonMaterial)
        {
            materials.push(mesh.material as MToonMaterial)
        }
    }
    console.log(materials)
    materials = Array.from(new Set(materials)) // 重複排除
    if (materials.length === 0)
    {
        return err({
            type: 'NO_MATERIALS_FOUND',
            message: 'MToonMaterial not found.',
        })
    }

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
        return err({
            type: 'ATLAS_GENERATION_FAILED',
            message: atlasesResult.error.message,
            cause: atlasesResult.error,
        })
    }

    const atlasMap = atlasesResult.value

    const materialPlacementMap = new Map<MToonMaterial, OffsetScale>()
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
        return err({
            type: 'UV_REMAPPING_FAILED',
            message: applyResult.error.message,
            cause: applyResult.error,
        })
    }

    // マテリアル結合処理：複数のMToonNodeMaterialを統合してドローコール数を削減
    const combineResult = combineMToonMaterials(rootNode)
    if (combineResult.isErr())
    {
        const combineError = combineResult.error
        return err({
            type: 'MATERIAL_COMBINE_FAILED',
            message: `Material combine failed: ${combineError.type} - ${combineError.message}`,
            cause: combineError,
        })
    }

    const { mesh: combinedMesh, statistics } = combineResult.value

    return ok({
        combinedMesh,
        statistics,
    })
}
