/**
 * Canvas 操作ユーティリティ
 * ブラウザとNode.js環境の両方で Canvas API を利用可能にするヘルパー
 */

import type { Canvas, CanvasContext } from '../types'

/**
 * Canvas から 2D コンテキストを取得
 */
export function getCanvasContext(canvas: Canvas): CanvasContext {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas')
  }
  return ctx as CanvasContext
}

/**
 * ImageData をバイナリデータに変換
 */
export function imageDataToUint8Array(
  imageData: ImageData,
): Uint8ClampedArray {
  return imageData.data
}

/**
 * Uint8Array を ImageData に変換
 */
export function uint8ArrayToImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  return new ImageData(new Uint8ClampedArray(data), width, height)
}

/**
 * Canvas を PNG DataURL に変換
 */
export async function canvasToDataURL(
  canvas: Canvas,
  type: string = 'image/png',
): Promise<string> {
  return canvas.toDataURL(type)
}

/**
 * Canvas を Blob に変換
 */
export async function canvasToBlob(
  canvas: Canvas,
  type: string = 'image/png',
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to convert canvas to blob'))
        }
      },
      type,
    )
  })
}

/**
 * Canvas を PNG バッファ（Uint8Array）に変換
 * ブラウザ環境では Blob → ArrayBuffer に変換
 * Node.js 環境では canvas.toBuffer() を使用
 */
export async function canvasToBuffer(
  canvas: Canvas,
  type: string = 'image/png',
): Promise<Uint8Array> {
  // Node.js 環境（canvas ライブラリがある場合）
  if ('toBuffer' in canvas) {
    const buffer = (canvas as any).toBuffer(type)
    return new Uint8Array(buffer)
  }

  // ブラウザ環境
  const blob = await canvasToBlob(canvas, type)
  const arrayBuffer = await blob.arrayBuffer()
  return new Uint8Array(arrayBuffer)
}

/**
 * Canvas をダウンスケーリング（縮小）
 * テクスチャサイズを削減する際に使用
 *
 * @param sourceCanvas - ソースキャンバス
 * @param scale - スケール係数 (0.1-1.0)
 * @param createCanvasFactory - Canvas 生成ファクトリ
 * @returns スケール済みキャンバス
 */
export function scaleCanvas(
  sourceCanvas: Canvas,
  scale: number,
  createCanvasFactory: (width: number, height: number) => Canvas,
): Canvas {
  if (scale <= 0 || scale > 1) {
    throw new Error('Scale must be between 0 and 1')
  }

  if (scale === 1) {
    // 縮小不要
    return sourceCanvas
  }

  const newWidth = Math.ceil(sourceCanvas.width * scale)
  const newHeight = Math.ceil(sourceCanvas.height * scale)

  const targetCanvas = createCanvasFactory(newWidth, newHeight)
  const targetCtx = getCanvasContext(targetCanvas)

  // drawImage で縮小描画
  targetCtx.drawImage(sourceCanvas, 0, 0, newWidth, newHeight)

  return targetCanvas
}
