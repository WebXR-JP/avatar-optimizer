/**
 * テクスチャアトラス化メイン実装
 *
 * glTF-Transform ドキュメント内のテクスチャを自動的に
 * 単一のアトラスに統合し、UV 座標を再マッピングします。
 */

import { ResultAsync } from 'neverthrow'
import type { Document, Texture } from '@gltf-transform/core'
import type {
  AtlasOptions,
  AtlasResult,
  AtlasError,
  CreateCanvasFactory,
  CreateImageDataFactory,
  UVMapping,
  PackedTexture,
  PackingResult,
} from '../types'
import { getCanvasContext, canvasToBuffer, scaleCanvas } from '../utils/canvas'
import { packTexturesNFDH } from './nfdh-packer'
import { remapAllPrimitiveUVs } from './uv-remapping'

/**
 * glTF-Transform ドキュメント内のテクスチャをアトラス化
 *
 * @param document - glTF-Transform ドキュメント
 * @param options - アトラス化オプション
 * @param createCanvasFactory - Canvas インスタンスを作成するためのファクトリ関数
 * @param createImageDataFactory - ImageData インスタンスを作成するためのファクトリ関数
 * @returns アトラス化済みドキュメント と UV マッピング情報
 */
export function atlasTexturesInDocument(
  document: Document,
  options: AtlasOptions = {},
  createCanvasFactory: CreateCanvasFactory,
  createImageDataFactory?: CreateImageDataFactory,
): ResultAsync<AtlasResult, AtlasError> {
  return ResultAsync.fromPromise(
    _atlasTexturesImpl(document, options, createCanvasFactory, createImageDataFactory),
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
  createCanvasFactory: CreateCanvasFactory,
  createImageDataFactory?: CreateImageDataFactory,
): Promise<AtlasResult> {
  const maxSize = options.maxSize ?? 2048
  const padding = options.padding ?? 4
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

  // 4. パッキング計算（maxSize のアトラスに自動的にスケーリングしながらパック）
  const sizes = scaledImages.map((img) => ({
    width: img.width,
    height: img.height,
  }))

  const finalPacking = await packTexturesNFDH(sizes, maxSize, maxSize, padding)

  // 5. アトラスキャンバスを生成
  const atlasCanvas = createCanvasFactory(finalPacking.atlasWidth, finalPacking.atlasHeight)
  const atlasCtx = getCanvasContext(atlasCanvas)

  // 背景をクリア（透明）
  atlasCtx.clearRect(0, 0, finalPacking.atlasWidth, finalPacking.atlasHeight)

  // 各テクスチャをアトラスに描画
  for (let i = 0; i < finalPacking.packed.length; i++) {
    const packedInfo = finalPacking.packed[i]
    const img = scaledImages[packedInfo.index]

    // テンポラリキャンバスを作成してImageDataを描画
    // node-canvas では putImageData が不完全なため、別のキャンバスに描画してから合成
    const tempCanvas = createCanvasFactory(img.width, img.height)
    const tempCtx = getCanvasContext(tempCanvas)

    // ImageData を作成（オプション）
    if (createImageDataFactory) {
      const imageData = createImageDataFactory(
        new Uint8ClampedArray(img.data),
        img.width,
        img.height,
      )
      tempCtx.putImageData(imageData, 0, 0)
    } else {
      // node-canvas では putImageData が使用不可能な場合がある
      // 代替方法：Canvas の内部バッファに直接アクセス（node-canvas 固有）
      _drawImageDataToCanvas(tempCtx, img.data, img.width, img.height)
    }

    // テンポラリキャンバスをメインキャンバスに描画
    atlasCtx.drawImage(tempCanvas, packedInfo.x, packedInfo.y)
  }

  // 6. アトラス画像をテクスチャとして登録
  const atlasBuffer = await canvasToBuffer(atlasCanvas, 'image/png')
  const atlasTexture = _registerAtlasTexture(document, atlasBuffer, finalPacking)

  // 7. UV 座標マッピング情報を生成
  const mappings = _generateUVMappings(
    document,
    finalPacking,
    textures,
  )

  // 7. マテリアルの参照を更新（古いテクスチャ → アトラス）
  _replaceMaterialTextures(document, textures, atlasTexture, mappings)

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
 * ImageData を Canvas に直接描画（node-canvas 互換版）
 * node-canvas では putImageData が不完全なため、getImageData と putImageData の組み合わせで対応
 */
function _drawImageDataToCanvas(
  ctx: any,
  data: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  // node-canvas でのバイパス方法：
  // Canvas のピクセルデータを直接操作する（node-canvas 固有）
  try {
    // ImageData オブジェクトを作成できない場合は、
    // Canvas の getImageData を使用して既存のオブジェクトを取得し、データをコピー
    const existingImageData = ctx.getImageData(0, 0, width, height)
    // データをコピー
    const targetData = existingImageData.data
    for (let i = 0; i < data.length; i++) {
      targetData[i] = data[i]
    }
    // 更新を反映
    ctx.putImageData(existingImageData, 0, 0)
  } catch (_error) {
    // putImageData が完全に失敗する場合は、フォールバック
    // ログするが、処理は継続（透明背景のままになる）
    console.warn(
      'Warning: putImageData not fully supported in this environment',
    )
  }
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
  mappings: UVMapping[],
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
 * Canvas を使用して画像をスケーリング
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

  const newWidth = Math.ceil(textureImage.width * scale)
  const newHeight = Math.ceil(textureImage.height * scale)

  // 注：ここで Canvas API を使用していないため、単純な間隔抽出法を使用
  // 実際には Canvas の drawImage で高品質なスケーリングが可能
  // ただし非同期処理が必要になるため、ここでは同期的に実装
  const scaledData = new Uint8ClampedArray(newWidth * newHeight * 4)

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      // ニアレストネイバー法で色をサンプリング
      const srcX = Math.floor(x / scale)
      const srcY = Math.floor(y / scale)
      const srcIndex = (srcY * textureImage.width + srcX) * 4
      const dstIndex = (y * newWidth + x) * 4

      scaledData[dstIndex] = textureImage.data[srcIndex]
      scaledData[dstIndex + 1] = textureImage.data[srcIndex + 1]
      scaledData[dstIndex + 2] = textureImage.data[srcIndex + 2]
      scaledData[dstIndex + 3] = textureImage.data[srcIndex + 3]
    }
  }

  return {
    width: newWidth,
    height: newHeight,
    data: scaledData,
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
