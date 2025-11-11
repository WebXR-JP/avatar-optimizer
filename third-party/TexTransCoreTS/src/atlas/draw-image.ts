/**
 * テクスチャアトラス画像生成
 *
 * PackingResult と画像データ配列を受け取って、
 * 統合されたアトラス画像を生成します。
 *
 * Jimp を使用してブラウザとNode.js環境の両方をサポート
 */

import { Jimp } from 'jimp'
import type { PackingResult } from '../types'

/**
 * 複数の画像データをアトラス画像に合成
 *
 * PackingResult と各画像データを受け取り、
 * 統合されたアトラス画像（Uint8ClampedArray）を生成します。
 *
 * Jimp を使用してブラウザとNode.js環境の両方で動作します。
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

      // テクスチャ画像を作成してアトラスに直接コピー
      _compositeImageData(
        atlasImage,
        sourceImageData,
        packedInfo.originalWidth,
        packedInfo.originalHeight,
        packedInfo.width,
        packedInfo.height,
        packedInfo.x,
        packedInfo.y,
        packing.atlasWidth,
      )
    }

    // Uint8ClampedArray に変換して返す
    return new Uint8ClampedArray(atlasImage.bitmap.data)
  } catch (error) {
    throw new Error(
      `Failed to draw images to atlas: ${String(error)}`,
    )
  }
}

/**
 * 画像データをアトラスに直接合成
 * リサイズ処理を含む
 */
function _compositeImageData(
  atlasImage: any,
  sourceImageData: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  targetX: number,
  targetY: number,
  atlasWidth: number,
): void {
  const atlasBitmap = atlasImage.bitmap.data

  // ニアレストネイバー法で、ソース画像からターゲット画像にリサンプリング
  const scaleX = sourceWidth / targetWidth
  const scaleY = sourceHeight / targetHeight

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      // ソース座標をサンプリング
      const srcX = Math.floor(x * scaleX)
      const srcY = Math.floor(y * scaleY)

      // ソース画像からピクセル読み取り
      const srcIndex = (srcY * sourceWidth + srcX) * 4
      const r = sourceImageData[srcIndex]
      const g = sourceImageData[srcIndex + 1]
      const b = sourceImageData[srcIndex + 2]
      const a = sourceImageData[srcIndex + 3]

      // ターゲット座標にピクセルを書き込み
      const dstX = targetX + x
      const dstY = targetY + y
      const dstIndex = (dstY * atlasWidth + dstX) * 4

      atlasBitmap[dstIndex] = r
      atlasBitmap[dstIndex + 1] = g
      atlasBitmap[dstIndex + 2] = b
      atlasBitmap[dstIndex + 3] = a
    }
  }
}

/**
 * 複数の画像データをアトラス画像に合成して PNG バッファに変換
 *
 * PackingResult と各画像データを受け取り、
 * 統合されたアトラス画像を PNG 形式で返します。
 *
 * Jimp を使用してブラウザとNode.js環境の両方で動作します。
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
    if (packing.packed.length === 0) {
      throw new Error('No packed textures provided')
    }
    if (packing.packed.length !== images.length) {
      throw new Error('Packing result and images length mismatch')
    }

    // アトラス画像を作成
    const atlasImage = new Jimp({
      width: packing.atlasWidth,
      height: packing.atlasHeight,
      color: 0x00000000, // RGBA(0,0,0,0) - 透明
    })

    // 各テクスチャをアトラスに合成
    for (let i = 0; i < packing.packed.length; i++) {
      const packedInfo = packing.packed[i]
      const sourceImageData = images[packedInfo.index]

      // テクスチャ画像をアトラスに直接コピー
      _compositeImageData(
        atlasImage,
        sourceImageData,
        packedInfo.originalWidth,
        packedInfo.originalHeight,
        packedInfo.width,
        packedInfo.height,
        packedInfo.x,
        packedInfo.y,
        packing.atlasWidth,
      )
    }

    // PNG バッファに変換
    const pngBuffer = await atlasImage.getBuffer('image/png')
    return new Uint8Array(pngBuffer)
  } catch (error) {
    throw new Error(
      `Failed to draw images to atlas buffer: ${String(error)}`,
    )
  }
}
