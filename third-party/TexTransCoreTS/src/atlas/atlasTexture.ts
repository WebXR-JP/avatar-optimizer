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
} from '../types'
import { createCanvas, getCanvasContext, canvasToDataURL } from '../utils/canvas'
import { packTexturesNFDH } from './nfdh-packer'

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
  const maxSize = options.maxSize ?? 2048

  return ResultAsync.fromPromise(
    _atlasTexturesImpl(document, maxSize),
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
  maxSize: number,
): Promise<AtlasResult> {
  // 1. ドキュメント内のテクスチャを収集
  const textures = document.getRoot().listTextures()
  if (textures.length === 0) {
    throw new Error('No textures found in document')
  }

  // 2. テクスチャ画像を読み込む
  const textureImages = await Promise.all(
    textures.map((texture) => _extractTextureImage(texture)),
  )

  // 3. パッキング計算
  const sizes = textureImages.map((img) => ({
    width: img.width,
    height: img.height,
  }))

  const packing = await packTexturesNFDH(sizes, maxSize, maxSize)

  // 4. アトラスキャンバスを生成
  const atlasCanvas = createCanvas(packing.atlasWidth, packing.atlasHeight)
  const atlasCtx = getCanvasContext(atlasCanvas)

  // 背景をクリア（透明）
  atlasCtx.clearRect(0, 0, packing.atlasWidth, packing.atlasHeight)

  // 各テクスチャをアトラスに描画
  for (let i = 0; i < packing.packed.length; i++) {
    const packed = packing.packed[i]
    const img = textureImages[i]

    // Canvas に ImageData を描画
    const imageData = new ImageData(
      new Uint8ClampedArray(img.data),
      img.width,
      img.height,
    )
    atlasCtx.putImageData(imageData, packed.x, packed.y)
  }

  // 5. アトラス画像をテクスチャとして登録
  // TODO: アトラス画像を glTF-Transform テクスチャとして登録
  // 6. UV 座標を再マッピング
  // TODO: プリミティブのインデックスを再マッピング

  // 仮置き: 実装スケルトン
  const mappings: any[] = []
  await canvasToDataURL(atlasCanvas, 'image/png')

  return {
    document,
    mapping: mappings,
    atlasMetadata: {
      width: packing.atlasWidth,
      height: packing.atlasHeight,
      textureCount: textures.length,
      packingEfficiency: _calculatePackingEfficiency(packing),
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
 * パッキング効率を計算
 */
function _calculatePackingEfficiency(_packing: any): number {
  // TODO: 実装
  return 0.8
}
