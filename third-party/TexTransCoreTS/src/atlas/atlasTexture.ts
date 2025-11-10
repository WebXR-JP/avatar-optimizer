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
  CreateImageDataFactory, // 追加
} from '../types'
import { getCanvasContext, canvasToDataURL } from '../utils/canvas'
import { packTexturesNFDH } from './nfdh-packer'

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

  const packing = await packTexturesNFDH(sizes, maxSize, maxSize, padding)

  // 4. アトラスキャンバスを生成
  const atlasCanvas = createCanvasFactory(packing.atlasWidth, packing.atlasHeight)
  const atlasCtx = getCanvasContext(atlasCanvas)

  // 背景をクリア（透明）
  atlasCtx.clearRect(0, 0, packing.atlasWidth, packing.atlasHeight)

  // 各テクスチャをアトラスに描画
  for (let i = 0; i < packing.packed.length; i++) {
    const packed = packing.packed[i]
    const img = textureImages[i]

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
    atlasCtx.drawImage(tempCanvas, packed.x, packed.y)
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
 * パッキング効率を計算
 */
function _calculatePackingEfficiency(_packing: any): number {
  // TODO: 実装
  return 0.8
}
