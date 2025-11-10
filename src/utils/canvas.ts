import { Canvas, Image } from 'canvas'

/**
 * ブラウザ・Node.js 両環境で動作する Canvas 作成
 */
export function createCanvas(
  width: number,
  height: number,
): HTMLCanvasElement | Canvas {
  if (typeof document !== 'undefined') {
    // ブラウザ環境
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  } else {
    // Node.js 環境
    return new Canvas(width, height)
  }
}

export function getCanvasContext(
  canvas: HTMLCanvasElement | Canvas,
): CanvasRenderingContext2D {
  return canvas.getContext('2d')!
}

export async function canvasToImageData(
  canvas: HTMLCanvasElement | Canvas,
): Promise<ImageData> {
  const ctx = getCanvasContext(canvas)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

export async function canvasToDataURL(
  canvas: HTMLCanvasElement | Canvas,
  type: string = 'image/png',
): Promise<string> {
  // ブラウザ環境
  if ('toDataURL' in canvas) {
    return canvas.toDataURL(type)
  }
  // Node.js 環境 (canvas パッケージ)
  return (canvas as any).toDataURL(type)
}
