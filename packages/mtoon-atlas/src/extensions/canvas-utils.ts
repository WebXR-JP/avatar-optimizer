/**
 * DOM の有無に依存しない 2D キャンバス操作のユーティリティ
 *
 * ブラウザのメインスレッドでは HTMLCanvasElement、Worker や Node（ポリフィル）では
 * OffscreenCanvas を使う。`HTMLCanvasElement` などのグローバルが存在しない環境でも
 * ReferenceError にならないよう、instanceof の前に必ず typeof で存在を確認する。
 */

/** 2D 描画と PNG 化ができるキャンバス */
export type Canvas2D = HTMLCanvasElement | OffscreenCanvas

/**
 * 指定サイズの 2D キャンバスを作成する
 * DOM があれば従来どおり document.createElement('canvas')、無ければ OffscreenCanvas を使う
 *
 * @returns キャンバス。どちらも使えない環境では null
 */
export function createCanvas2D(width: number, height: number): Canvas2D | null
{
  if (typeof document !== 'undefined')
  {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  if (typeof OffscreenCanvas !== 'undefined')
  {
    return new OffscreenCanvas(width, height)
  }
  return null
}

/** HTMLCanvasElement / OffscreenCanvas かどうか（グローバルが無い環境でも安全） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isCanvas2D(image: any): image is Canvas2D
{
  return (
    (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) ||
    (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas)
  )
}

/** drawImage で描ける画像（HTMLImageElement / ImageBitmap）かどうか */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isDrawableImage(image: any): image is HTMLImageElement | ImageBitmap
{
  return (
    (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) ||
    (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
  )
}

/**
 * キャンバスを PNG の Blob に変換する
 *
 * @returns PNG Blob。変換できなかった場合は null
 */
export function canvasToPngBlob(canvas: Canvas2D): Promise<Blob | null>
{
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas)
  {
    return canvas.convertToBlob({ type: 'image/png' })
  }
  return new Promise((resolve) =>
  {
    (canvas as HTMLCanvasElement).toBlob((blob) => resolve(blob), 'image/png')
  })
}
