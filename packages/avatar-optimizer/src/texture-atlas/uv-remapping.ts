/**
 * UV 座標の再マッピング実装
 *
 * テクスチャがアトラス内で物理的に移動した分だけ、
 * モデルの UV 座標も同じ量だけ移動させる
 */

import type { Document, Primitive } from '@gltf-transform/core'
import type { UVMapping } from '../types'

/**
 * テクスチャ内の領域を表現
 * 元位置とアトラス内新位置の対応付けに使用
 */
interface IslandRegion {
  // 元テクスチャ内の位置・サイズ（ピクセル座標）
  sourceTextureIndex: number
  sourceWidth: number
  sourceHeight: number

  // アトラス内の新位置・サイズ（ピクセル座標）
  targetX: number
  targetY: number
  targetWidth: number
  targetHeight: number
}

/**
 * UV 座標を再計算
 *
 * 重要: テクスチャが物理的に移動した分だけ、
 *       モデルの UV 座標も同じ量だけ移動させる
 *
 * @param oldU - 元の U 座標 [0, 1]
 * @param oldV - 元の V 座標 [0, 1]
 * @param region - テクスチャがどこに配置されたかの情報
 * @param atlasWidth - アトラス全体の幅（ピクセル）
 * @param atlasHeight - アトラス全体の高さ（ピクセル）
 * @returns 新しい UV 座標
 */
export function remapUVCoordinate(
  oldU: number,
  oldV: number,
  region: IslandRegion,
  atlasWidth: number,
  atlasHeight: number,
): { newU: number; newV: number } {
  // Step 1: 元テクスチャ内でのピクセル座標を計算
  const sourcePixelX = oldU * region.sourceWidth
  const sourcePixelY = oldV * region.sourceHeight

  // Step 2: アトラス内での絶対ピクセル位置を計算
  // = 新島の位置 + (元島内での相対位置)
  const atlasPixelX = region.targetX + sourcePixelX
  const atlasPixelY = region.targetY + sourcePixelY

  // Step 3: アトラス全体の UV 座標に正規化
  const newU = atlasPixelX / atlasWidth
  const newV = atlasPixelY / atlasHeight

  return { newU, newV }
}

/**
 * プリミティブの TEXCOORD_0 属性を再マッピング
 *
 * @param primitive - 更新対象のプリミティブ
 * @param islandRegion - テクスチャ配置情報
 * @param atlasWidth - アトラス幅
 * @param atlasHeight - アトラス高さ
 */
export function remapPrimitiveUVs(
  primitive: Primitive,
  islandRegion: IslandRegion,
  atlasWidth: number,
  atlasHeight: number,
): void {
  // TEXCOORD_0 属性を取得
  const uvAttribute = primitive.getAttribute('TEXCOORD_0')
  if (!uvAttribute) {
    // UV 属性がない場合は何もしない
    return
  }

  // UV データを取得
  const uvArray = uvAttribute.getArray()
  if (!uvArray) return

  // 各 UV 座標を再マッピング
  for (let i = 0; i < uvArray.length; i += 2) {
    const oldU = uvArray[i]
    const oldV = uvArray[i + 1]

    const { newU, newV } = remapUVCoordinate(
      oldU,
      oldV,
      islandRegion,
      atlasWidth,
      atlasHeight,
    )

    uvArray[i] = newU
    uvArray[i + 1] = newV
  }

  // 属性を更新
  uvAttribute.setArray(uvArray)
}

/**
 * ドキュメント内のすべてのプリミティブの UV を再マッピング
 *
 * @param document - glTF-Transform ドキュメント
 * @param mappings - UV マッピング情報
 * @param atlasWidth - アトラス幅
 * @param atlasHeight - アトラス高さ
 * @param textureSizes - 元のテクスチャサイズ
 */
export function remapAllPrimitiveUVs(
  document: Document,
  mappings: UVMapping[],
  atlasWidth: number,
  atlasHeight: number,
  textureSizes: Array<{ width: number; height: number }>,
): void {
  // テクスチャインデックスごとに IslandRegion を構築
  const islandsByTextureIndex = new Map<number, IslandRegion>()

  mappings.forEach((mapping) => {
    const textureIndex = mapping.originalTextureIndex

    // 同じテクスチャインデックスの islandRegion を取得（または作成）
    if (!islandsByTextureIndex.has(textureIndex)) {
      const textureSize = textureSizes[textureIndex]
      islandsByTextureIndex.set(textureIndex, {
        sourceTextureIndex: textureIndex,
        sourceWidth: textureSize.width,
        sourceHeight: textureSize.height,
        targetX: Math.round(mapping.uvMin.u * atlasWidth),
        targetY: Math.round(mapping.uvMin.v * atlasHeight),
        targetWidth: Math.round(
          (mapping.uvMax.u - mapping.uvMin.u) * atlasWidth,
        ),
        targetHeight: Math.round(
          (mapping.uvMax.v - mapping.uvMin.v) * atlasHeight,
        ),
      })
    }
  })

  // すべてのプリミティブを走査
  const meshes = document.getRoot().listMeshes()
  const primitives: Primitive[] = []
  meshes.forEach((mesh) => {
    mesh.listPrimitives().forEach((prim) => {
      primitives.push(prim)
    })
  })

  primitives.forEach((primitive, primitiveIndex) => {
    // このプリミティブに対応するマッピングを検索
    const relevantMappings = mappings.filter(
      (m) => m.primitiveIndex === primitiveIndex,
    )

    // マッピングがない場合は更新しない
    if (relevantMappings.length === 0) return

    // 最初のマッピングを使用（通常は baseColorTexture）
    const mapping = relevantMappings[0]
    const islandRegion = islandsByTextureIndex.get(mapping.originalTextureIndex)

    if (!islandRegion) return

    remapPrimitiveUVs(primitive, islandRegion, atlasWidth, atlasHeight)
  })
}
