/**
 * Canvas 操作ユーティリティ
 * ブラウザとNode.js環境の両方で Canvas API を利用可能にするヘルパー
 */

import type { Canvas, CanvasContext } from '../types'

/**
 * Canvas インスタンスを作成（ブラウザ/Node.js自動判定）
 */
export function createCanvas(width: number, height: number): Canvas {
  // ブラウザ環境
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas as Canvas
  }

  // Node.js環境: canvas パッケージを使用
  try {
    // Dynamic require を避けるため、モジュールの存在を前提
    // ※ 実際には npm install canvas が必要
    const CanvasConstructor = require('canvas').Canvas
    return new CanvasConstructor(width, height) as Canvas
  } catch {
    throw new Error(
      'Canvas is not available in this environment. Install "canvas" package for Node.js support.',
    )
  }
}

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
