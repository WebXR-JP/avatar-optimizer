/**
 * テクスチャアトラス化メイン実装
 *
 * glTF-Transform ドキュメント内のテクスチャを自動的に
 * 単一のアトラスに統合し、UV 座標を再マッピングします。
 */

import { ResultAsync } from 'neverthrow'
import { Jimp } from 'jimp'
import type { Document, Texture } from '@gltf-transform/core'
import type {
  AtlasOptions,
  AtlasResult,
  AtlasError,
  UVMapping,
  PackedTexture,
  PackingResult,
} from '../types'
import { packTexturesNFDH } from './nfdh-packer'
import { remapAllPrimitiveUVs } from './uv-remapping'
import { drawImagesToAtlas, drawImagesToAtlasBuffer } from './draw-image'

/**
 * 複数の画像データからアトラスを生成
 *
 * 与えられた複数の画像データをパッキングし、単一のアトラス画像を生成します。
 * glTF ドキュメント統合なしで、純粋な画像生成機能を提供します。
 *
 * @param imageSizes - 画像サイズ配列 { width, height }
 * @param images - 画像データ配列（Uint8ClampedArray）
 * @param maxSize - アトラスの最大サイズ
 * @returns { atlasImageData, packing, atlasBuffer } - アトラス画像データ、パッキング情報、PNG バッファ
 */
export async function packAndCreateAtlas(
  imageSizes: Array<{ width: number; height: number }>,
  images: Uint8ClampedArray[],
  maxSize: number = 2048,
): Promise<{
  atlasImageData: Uint8ClampedArray
  packing: PackingResult
  atlasBuffer: Uint8Array
}> {
  if (imageSizes.length === 0) {
    throw new Error('No images provided')
  }
  if (imageSizes.length !== images.length) {
    throw new Error('Image sizes and images length mismatch')
  }

  // 1. パッキング計算
  const packing = await packTexturesNFDH(imageSizes, maxSize, maxSize)

  // 2. 画像をアトラスに合成（Uint8ClampedArray を返す）
  const atlasImageData = await drawImagesToAtlas(packing, images)

  // 3. アトラス画像データを PNG バッファに変換（Canvas操作は draw-image で完結）
  const atlasBuffer = await drawImagesToAtlasBuffer(packing, images)

  return {
    atlasImageData,
    packing,
    atlasBuffer,
  }
}

/**
 * glTF-Transform ドキュメント内のテクスチャをアトラス化
 *
 * @param document - glTF-Transform ドキュメント
 * @param options - アトラス化オプション
 * @returns アトラス化済みドキュメント と UV マッピング情報
 */
export function atlasTexturesInDocument(
  document: Document,
  options: AtlasOptions = {},
): ResultAsync<AtlasResult, AtlasError> {
  return ResultAsync.fromPromise(
    _atlasTexturesImpl(document, options),
    (error) => ({
      type: 'UNKNOWN_ERROR' as const,
      message: `Atlas failed: ${String(error)}`,
    }),
  )
}

/**
 * 実装関数（内部）
 */
async function _atlasTexturesImpl(
  document: Document,
  options: AtlasOptions,
): Promise<AtlasResult> {
  const maxSize = options.maxSize ?? 2048
  const textureScale = options.textureScale ?? 1.0

  // 1. ドキュメント内のテクスチャを収集
  const textures = document.getRoot().listTextures()
  if (textures.length === 0) {
    throw new Error('No textures found in document')
  }

  // 2. テクスチャ画像を読み込む
  const textureImages = await Promise.all(
    textures.map((texture) => _extractTextureImage(texture)),
  )

  // 3. テクスチャをダウンスケーリング（オプション）
  let scaledImages = textureImages
  if (textureScale < 1.0) {
    scaledImages = textureImages.map((img) => _scaleTextureImage(img, textureScale))
  }

  // 4. パッキング計算とアトラス生成
  const imageSizes = scaledImages.map((img) => ({
    width: img.width,
    height: img.height,
  }))
  const imageDataArrays = scaledImages.map((img) => img.data)

  const { packing: finalPacking, atlasBuffer } = await packAndCreateAtlas(
    imageSizes,
    imageDataArrays,
    maxSize,
  )

  // 5. アトラス画像をテクスチャとして登録
  const atlasTexture = _registerAtlasTexture(document, atlasBuffer, finalPacking)

  // 6. UV 座標マッピング情報を生成
  const mappings = _generateUVMappings(
    document,
    finalPacking,
    textures,
  )

  // 7. マテリアルの参照を更新（古いテクスチャ → アトラス）
  _replaceMaterialTextures(document, textures, atlasTexture)

  // 8. プリミティブの UV 座標を再マッピング
  const textureSizes = scaledImages.map((img) => ({
    width: img.width,
    height: img.height,
  }))
  remapAllPrimitiveUVs(
    document,
    mappings,
    finalPacking.atlasWidth,
    finalPacking.atlasHeight,
    textureSizes,
  )

  return {
    document,
    mapping: mappings,
    atlasMetadata: {
      width: finalPacking.atlasWidth,
      height: finalPacking.atlasHeight,
      textureCount: textures.length,
      packingEfficiency: _calculatePackingEfficiency(finalPacking),
    },
  }
}

/**
 * テクスチャから画像データを抽出
 */
async function _extractTextureImage(texture: Texture): Promise<{
  width: number
  height: number
  data: Uint8ClampedArray
}> {
  const size = texture.getSize();
  if (!size) {
    throw new Error(`Texture ${texture.getName()} has no size information.`);
  }
  const [width, height] = size;

  const data = texture.getImage(); // This is a Uint8Array
  if (!data) {
    throw new Error(`Texture ${texture.getName()} image data is null.`);
  }

  return {
    width,
    height,
    data: new Uint8ClampedArray(data.buffer), // Convert to Uint8ClampedArray
  };
}

/**
 * アトラス画像を glTF-Transform テクスチャとして登録
 */
function _registerAtlasTexture(
  document: Document,
  atlasBuffer: Uint8Array,
  _packing: any,
): Texture {
  // アトラス用テクスチャを作成
  const atlasTexture = document.createTexture('atlas-texture')
    .setImage(atlasBuffer)
    .setMimeType('image/png')

  return atlasTexture
}

/**
 * UV マッピング情報を生成
 * プリミティブごとに、どのテクスチャスロットがアトラスのどこに配置されたかを記録
 */
function _generateUVMappings(
  document: Document,
  finalPacking: any,
  originalTextures: Texture[],
): UVMapping[] {
  const mappings: UVMapping[] = []

  // プリミティブを収集（メッシュ → ノード → プリミティブ）
  const primitives: any[] = []
  const meshes = document.getRoot().listMeshes()
  meshes.forEach((mesh) => {
    mesh.listPrimitives().forEach((primitive) => {
      primitives.push(primitive)
    })
  })

  // 各プリミティブを検査して、使用されているテクスチャをマッピング
  primitives.forEach((primitive, primitiveIndex) => {
    const material = primitive.getMaterial()
    if (!material) return

    // baseColorTexture の確認
    const baseColorTexture = material.getBaseColorTexture()
    if (baseColorTexture) {
      const textureIndex = originalTextures.indexOf(baseColorTexture)
      if (textureIndex !== -1) {
        const packed = finalPacking.packed.find(
          (p: PackedTexture) => p.index === textureIndex,
        )
        if (packed) {
          mappings.push({
            primitiveIndex,
            textureSlot: 'baseColorTexture',
            originalTextureIndex: textureIndex,
            uvMin: {
              u: packed.x / finalPacking.atlasWidth,
              v: packed.y / finalPacking.atlasHeight,
            },
            uvMax: {
              u: (packed.x + packed.width) / finalPacking.atlasWidth,
              v: (packed.y + packed.height) / finalPacking.atlasHeight,
            },
          })
        }
      }
    }

    // normalTexture の確認
    const normalTexture = material.getNormalTexture()
    if (normalTexture) {
      const textureIndex = originalTextures.indexOf(normalTexture)
      if (textureIndex !== -1) {
        const packed = finalPacking.packed.find(
          (p: PackedTexture) => p.index === textureIndex,
        )
        if (packed) {
          mappings.push({
            primitiveIndex,
            textureSlot: 'normalTexture',
            originalTextureIndex: textureIndex,
            uvMin: {
              u: packed.x / finalPacking.atlasWidth,
              v: packed.y / finalPacking.atlasHeight,
            },
            uvMax: {
              u: (packed.x + packed.width) / finalPacking.atlasWidth,
              v: (packed.y + packed.height) / finalPacking.atlasHeight,
            },
          })
        }
      }
    }

    // metallicRoughnessTexture の確認
    const metallicRoughnessTexture = material.getMetallicRoughnessTexture()
    if (metallicRoughnessTexture) {
      const textureIndex = originalTextures.indexOf(metallicRoughnessTexture)
      if (textureIndex !== -1) {
        const packed = finalPacking.packed.find(
          (p: PackedTexture) => p.index === textureIndex,
        )
        if (packed) {
          mappings.push({
            primitiveIndex,
            textureSlot: 'metallicRoughnessTexture',
            originalTextureIndex: textureIndex,
            uvMin: {
              u: packed.x / finalPacking.atlasWidth,
              v: packed.y / finalPacking.atlasHeight,
            },
            uvMax: {
              u: (packed.x + packed.width) / finalPacking.atlasWidth,
              v: (packed.y + packed.height) / finalPacking.atlasHeight,
            },
          })
        }
      }
    }

    // occlusionTexture の確認
    const occlusionTexture = material.getOcclusionTexture()
    if (occlusionTexture) {
      const textureIndex = originalTextures.indexOf(occlusionTexture)
      if (textureIndex !== -1) {
        const packed = finalPacking.packed.find(
          (p: PackedTexture) => p.index === textureIndex,
        )
        if (packed) {
          mappings.push({
            primitiveIndex,
            textureSlot: 'occlusionTexture',
            originalTextureIndex: textureIndex,
            uvMin: {
              u: packed.x / finalPacking.atlasWidth,
              v: packed.y / finalPacking.atlasHeight,
            },
            uvMax: {
              u: (packed.x + packed.width) / finalPacking.atlasWidth,
              v: (packed.y + packed.height) / finalPacking.atlasHeight,
            },
          })
        }
      }
    }

    // emissiveTexture の確認
    const emissiveTexture = material.getEmissiveTexture()
    if (emissiveTexture) {
      const textureIndex = originalTextures.indexOf(emissiveTexture)
      if (textureIndex !== -1) {
        const packed = finalPacking.packed.find(
          (p: PackedTexture) => p.index === textureIndex,
        )
        if (packed) {
          mappings.push({
            primitiveIndex,
            textureSlot: 'emissiveTexture',
            originalTextureIndex: textureIndex,
            uvMin: {
              u: packed.x / finalPacking.atlasWidth,
              v: packed.y / finalPacking.atlasHeight,
            },
            uvMax: {
              u: (packed.x + packed.width) / finalPacking.atlasWidth,
              v: (packed.y + packed.height) / finalPacking.atlasHeight,
            },
          })
        }
      }
    }
  })

  return mappings
}

/**
 * マテリアルのテクスチャ参照をアトラスに置き換える
 */
function _replaceMaterialTextures(
  document: Document,
  originalTextures: Texture[],
  atlasTexture: Texture,
): void {
  const materials = document.getRoot().listMaterials()

  materials.forEach((material) => {
    // baseColorTexture を確認して置き換え
    if (material.getBaseColorTexture()) {
      const textureIndex = originalTextures.indexOf(
        material.getBaseColorTexture()!,
      )
      if (textureIndex !== -1) {
        material.setBaseColorTexture(atlasTexture)
      }
    }

    // normalTexture を確認して置き換え
    if (material.getNormalTexture()) {
      const textureIndex = originalTextures.indexOf(material.getNormalTexture()!)
      if (textureIndex !== -1) {
        material.setNormalTexture(atlasTexture)
      }
    }

    // metallicRoughnessTexture を確認して置き換え
    if (material.getMetallicRoughnessTexture()) {
      const textureIndex = originalTextures.indexOf(
        material.getMetallicRoughnessTexture()!,
      )
      if (textureIndex !== -1) {
        material.setMetallicRoughnessTexture(atlasTexture)
      }
    }

    // occlusionTexture を確認して置き換え
    if (material.getOcclusionTexture()) {
      const textureIndex = originalTextures.indexOf(
        material.getOcclusionTexture()!,
      )
      if (textureIndex !== -1) {
        material.setOcclusionTexture(atlasTexture)
      }
    }

    // emissiveTexture を確認して置き換え
    if (material.getEmissiveTexture()) {
      const textureIndex = originalTextures.indexOf(
        material.getEmissiveTexture()!,
      )
      if (textureIndex !== -1) {
        material.setEmissiveTexture(atlasTexture)
      }
    }
  })

  // 不要なテクスチャを削除（アトラス化に含まれたもの）
  originalTextures.forEach((texture) => {
    // テクスチャがどのマテリアルにも使用されていないかを確認
    const isUsed = materials.some(
      (material) =>
        material.getBaseColorTexture() === texture ||
        material.getNormalTexture() === texture ||
        material.getMetallicRoughnessTexture() === texture ||
        material.getOcclusionTexture() === texture ||
        material.getEmissiveTexture() === texture,
    )

    if (!isUsed) {
      // テクスチャを削除
      texture.dispose()
    }
  })
}

/**
 * テクスチャ画像をダウンスケーリング
 * Jimp を使用して高品質なスケーリングを実行
 */
function _scaleTextureImage(
  textureImage: {
    width: number
    height: number
    data: Uint8ClampedArray
  },
  scale: number,
): {
  width: number
  height: number
  data: Uint8ClampedArray
} {
  if (scale === 1) return textureImage

  const sourceImage = new Jimp({
    width: textureImage.width,
    height: textureImage.height,
  })

  // bitmap.data に RGBA データをコピー
  const bitmapData = Buffer.from(textureImage.data)
  for (let i = 0; i < bitmapData.length; i++) {
    sourceImage.bitmap.data[i] = bitmapData[i]
  }

  // スケーリング実行
  const newWidth = Math.ceil(textureImage.width * scale)
  const newHeight = Math.ceil(textureImage.height * scale)
  sourceImage.resize({
    w: newWidth,
    h: newHeight,
  })

  // Uint8ClampedArray に変換して返す
  return {
    width: newWidth,
    height: newHeight,
    data: new Uint8ClampedArray(sourceImage.bitmap.data),
  }
}

/**
 * パッキング効率を計算
 */
function _calculatePackingEfficiency(packing: PackingResult): number {
  const atlasArea = packing.atlasWidth * packing.atlasHeight
  const usedArea = packing.packed.reduce(
    (sum: number, p: PackedTexture) => sum + p.width * p.height,
    0,
  )
  return usedArea / atlasArea
}
