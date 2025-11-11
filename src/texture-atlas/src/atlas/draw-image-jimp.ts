/**
 * テクスチャアトラス画像生成
 *
 * PackingResult と画像データ配列を受け取って、
 * 統合されたアトラス画像を生成します。
 *
 * Jimp を使用してブラウザとNode.js環境の両方をサポート
 * Jimp の composite メソッドを使用して、効率的に画像を合成します。
 */

import { Jimp } from 'jimp'
import type { PackingResult } from '../types'

/**
 * アトラス画像を作成して各テクスチャを合成
 *
 * PackingResult と各画像データを受け取り、
 * 統合されたアトラス画像を生成します。
 *
 * @param packing - パッキング情報（atlasWidth, atlasHeight, packed[]）
 * @param images - 各画像の Uint8ClampedArray データ（RGBA）
 * @returns 作成されたアトラス画像（Jimp オブジェクト）
 */
async function _createAtlasImage(
  packing: PackingResult,
  images: Uint8ClampedArray[],
): Promise<any> {
  if (packing.packed.length === 0) {
    throw new Error('No packed textures provided')
  }
  if (packing.packed.length !== images.length) {
    throw new Error('Packing result and images length mismatch')
  }

  // アトラス画像を作成（透明背景）
  const atlasImage = new Jimp({
    width: packing.atlasWidth,
    height: packing.atlasHeight,
    color: 0x00000000, // RGBA(0,0,0,0) - 透明
  })

  // 各テクスチャをアトラスに合成
  for (let i = 0; i < packing.packed.length; i++) {
    const packedInfo = packing.packed[i]
    const sourceImageData = images[packedInfo.index]

    // Jimp の composite メソッドを使用して合成
    await _compositeImageToAtlas(
      atlasImage,
      sourceImageData,
      packedInfo.originalWidth,
      packedInfo.originalHeight,
      packedInfo.width,
      packedInfo.height,
      packedInfo.x,
      packedInfo.y,
    )
  }

  return atlasImage
}

/**
 * 画像データをアトラスに合成
 * Jimp の composite メソッドを使用してリサイズと合成を実行
 */
async function _compositeImageToAtlas(
  atlasImage: any,
  sourceImageData: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  targetX: number,
  targetY: number,
): Promise<void> {
  // Uint8ClampedArray を Buffer に変換
  const buffer = Buffer.from(sourceImageData.buffer, sourceImageData.byteOffset, sourceImageData.byteLength)

  // Jimp.read を使用して画像を読み込む
  const sourceImage = await Jimp.fromBitmap({
    data: buffer,
    width: sourceWidth,
    height: sourceHeight,
  });

  // ターゲットサイズにリサイズ（リサイズが必要な場合）
  if (sourceWidth !== targetWidth || sourceHeight !== targetHeight) {
    sourceImage.resize({ w: targetWidth, h: targetHeight })
  }

  // Jimp の composite メソッドを使用してアトラスに合成
  // x, y は整数値である必要があります
  atlasImage.composite(sourceImage, Math.floor(targetX), Math.floor(targetY))
}

/**
 * 複数の画像データをアトラス画像に合成
 *
 * PackingResult と各画像データを受け取り、
 * 統合されたアトラス画像（Uint8ClampedArray）を生成します。
 *
 * Jimp の composite メソッドを使用してブラウザとNode.js環境の両方で動作します。
 *
 * @param packing - パッキング情報（atlasWidth, atlasHeight, packed[]）
 * @param images - 各画像の Uint8ClampedArray データ（RGBA）
 * @returns アトラス画像データ（Uint8ClampedArray、RGBA形式）
 */
export async function drawImagesToAtlas(
  packing: PackingResult,
  images: Uint8ClampedArray[],
): Promise<Uint8ClampedArray> {
  try {
    const atlasImage = await _createAtlasImage(packing, images)

    // Uint8ClampedArray に変換して返す
    return new Uint8ClampedArray(atlasImage.bitmap.data)
  } catch (error) {
    throw new Error(
      `Failed to draw images to atlas: ${String(error)}`,
    )
  }
}

/**
 * 複数の画像データをアトラス画像に合成して PNG バッファに変換
 *
 * PackingResult と各画像データを受け取り、
 * 統合されたアトラス画像を PNG 形式で返します。
 *
 * Jimp の composite メソッドを使用してブラウザとNode.js環境の両方で動作します。
 *
 * @param packing - パッキング情報（atlasWidth, atlasHeight, packed[]）
 * @param images - 各画像の Uint8ClampedArray データ（RGBA）
 * @returns PNG 形式の Uint8Array バッファ
 */
export async function drawImagesToAtlasBuffer(
  packing: PackingResult,
  images: Uint8ClampedArray[],
): Promise<Uint8Array> {
  try {
    const atlasImage = await _createAtlasImage(packing, images)

    // PNG バッファに変換
    const pngBuffer = await atlasImage.getBuffer('image/png')
    return new Uint8Array(pngBuffer)
  } catch (error) {
    throw new Error(
      `Failed to draw images to atlas buffer: ${String(error)}`,
    )
  }
}
