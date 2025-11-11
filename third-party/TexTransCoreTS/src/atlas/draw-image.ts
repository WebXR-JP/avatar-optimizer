/**
 * テクスチャアトラス画像生成
 *
 * PackingResult と画像データ配列を受け取って、
 * 統合されたアトラス画像を生成します。
 *
 * 外部インターフェースは Canvas に非依存で、
 * 画像データの入出力のみを扱います。
 */

import type { PackingResult, CreateCanvasFactory } from '../types'
import { getCanvasContext } from '../utils/canvas'

/**
 * Canvas インスタンスを動的に取得
 * ブラウザ環境と Node.js 環境の両方に対応
 */
function _getCanvasFactory(): CreateCanvasFactory {
  // ブラウザ環境
  if (typeof document !== 'undefined') {
    return (width: number, height: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return canvas
    }
  }

  // Node.js 環境
  try {
    // node-canvas をダイナミックインポート
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const { Canvas } = require('canvas')
    return (width: number, height: number) => new Canvas(width, height)
  } catch (_error) {
    throw new Error(
      'Canvas is not available. Please install the "canvas" package for Node.js environments.',
    )
  }
}

/**
 * 複数の画像データをアトラス画像に合成
 *
 * PackingResult と各画像データを受け取り、
 * 統合されたアトラス画像（Uint8ClampedArray）を生成します。
 *
 * Canvas API は内部で自動的に初期化されるため、
 * 呼び出し側では Canvas について考慮する必要がありません。
 *
 * @param packing - パッキング情報（atlasWidth, atlasHeight, packed[]）
 * @param images - 各画像の Uint8ClampedArray データ（RGBA）
 * @returns アトラス画像データ（Uint8ClampedArray、RGBA形式）
 */
export function drawImagesToAtlas(
  packing: PackingResult,
  images: Uint8ClampedArray[],
): Uint8ClampedArray {
  const createCanvasFactory = _getCanvasFactory()
  if (packing.packed.length === 0) {
    throw new Error('No packed textures provided')
  }
  if (packing.packed.length !== images.length) {
    throw new Error('Packing result and images length mismatch')
  }

  // アトラスキャンバスを生成
  const atlasCanvas = createCanvasFactory(packing.atlasWidth, packing.atlasHeight)
  const atlasCtx = getCanvasContext(atlasCanvas)

  // 背景をクリア（透明）
  atlasCtx.clearRect(0, 0, packing.atlasWidth, packing.atlasHeight)

  // 各テクスチャをアトラスに描画
  for (let i = 0; i < packing.packed.length; i++) {
    const packedInfo = packing.packed[i]
    const imageData = images[packedInfo.index]

    // テンポラリキャンバスを作成して ImageData を描画
    const tempCanvas = createCanvasFactory(packedInfo.width, packedInfo.height)
    const tempCtx = getCanvasContext(tempCanvas)

    // ImageData を Canvas に描画（環境別対応）
    _putImageDataToCanvas(
      tempCtx,
      imageData,
      packedInfo.width,
      packedInfo.height,
    )

    // テンポラリキャンバスをメインキャンバスに描画
    atlasCtx.drawImage(tempCanvas, packedInfo.x, packedInfo.y)
  }

  // Canvas からピクセルデータを取得
  const atlasImageData = atlasCtx.getImageData(
    0,
    0,
    packing.atlasWidth,
    packing.atlasHeight,
  )

  return atlasImageData.data as Uint8ClampedArray
}

/**
 * ImageData を Canvas に描画（環境別対応）
 *
 * ブラウザと node-canvas 環境の両方に対応します。
 * node-canvas では putImageData が不完全なため、
 * 複数のフォールバック方法を試行します。
 *
 * @param ctx - Canvas 2D コンテキスト
 * @param data - 画像データ（Uint8ClampedArray）
 * @param width - 画像の幅
 * @param height - 画像の高さ
 */
function _putImageDataToCanvas(
  ctx: any,
  data: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  // パターン1: ctx.createImageData + putImageData を試行
  try {
    const imgData = ctx.createImageData(width, height)
    // 抽出した画像データを ImageData.data にコピー
    for (let i = 0; i < data.length; i++) {
      imgData.data[i] = data[i]
    }
    ctx.putImageData(imgData, 0, 0)
    return
  } catch (error) {
    console.warn(
      `Warning: Failed to use ctx.createImageData and putImageData: ${error}. Trying Canvas pixel manipulation.`,
    )
  }

  // パターン3: Canvas の getImageData/putImageData を使用（node-canvas 互換版）
  try {
    const existingImageData = ctx.getImageData(0, 0, width, height)
    const targetData = existingImageData.data
    for (let i = 0; i < data.length; i++) {
      targetData[i] = data[i]
    }
    ctx.putImageData(existingImageData, 0, 0)
    return
  } catch (error) {
    console.warn(
      `Warning: Failed to manipulate Canvas pixels: ${error}. Image data may not be rendered correctly.`,
    )
  }
}
