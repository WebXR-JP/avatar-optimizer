/**
 * 様々な画像形式から RGBA ピクセルデータを抽出するユーティリティ
 *
 * MToonAtlasExporterPlugin および avatar-optimizer の KTX2 圧縮処理で共有する。
 */

import { createCanvas2D, isCanvas2D, isDrawableImage } from './canvas-utils'

/**
 * 様々な画像形式から RGBA データを抽出
 *
 * @param image - 画像データ（DataTexture の image, HTMLCanvasElement, OffscreenCanvas, HTMLImageElement, ImageBitmap 等）
 * @returns RGBA 形式の Uint8Array
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function extractRgbaData(image: any): Promise<Uint8Array>
{
  // DataTexture（image.data がある場合）
  if (image.data && image.width && image.height)
  {
    const srcData = image.data
    const isFloatData =
      srcData instanceof Float32Array ||
      srcData.constructor?.name === 'Float32Array'
    const pixelCount = image.width * image.height * 4

    if (isFloatData)
    {
      const rgbaData = new Uint8Array(pixelCount)
      for (let i = 0; i < pixelCount; i++)
      {
        rgbaData[i] = Math.round(Math.min(1, Math.max(0, srcData[i])) * 255)
      }
      return rgbaData
    } else
    {
      return new Uint8Array(srcData)
    }
  }

  // HTMLCanvasElement / OffscreenCanvas
  if (isCanvas2D(image))
  {
    const ctx = image.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (ctx)
    {
      const imageData = ctx.getImageData(0, 0, image.width, image.height)
      return new Uint8Array(imageData.data)
    }
  }

  // HTMLImageElement または ImageBitmap
  if (isDrawableImage(image))
  {
    const canvas = createCanvas2D(image.width, image.height)
    const ctx = canvas?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
    if (ctx)
    {
      ctx.drawImage(image, 0, 0)
      const imageData = ctx.getImageData(0, 0, image.width, image.height)
      return new Uint8Array(imageData.data)
    }
  }

  // toDataURL 対応オブジェクト（OffscreenCanvas 等）
  if (typeof image.toDataURL === 'function')
  {
    // toDataURL から Image を作成して Canvas に描画
    return new Promise((resolve, reject) =>
    {
      const dataUrl: string = image.toDataURL('image/png')
      const img = new Image()
      img.onload = () =>
      {
        const canvas = createCanvas2D(img.width, img.height)
        const ctx = canvas?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
        if (ctx)
        {
          ctx.drawImage(img, 0, 0)
          const imageData = ctx.getImageData(0, 0, img.width, img.height)
          resolve(new Uint8Array(imageData.data))
        } else
        {
          reject(new Error('Canvas 2D context取得に失敗'))
        }
      }
      img.onerror = () => reject(new Error('画像のロードに失敗'))
      img.src = dataUrl
    })
  }

  throw new Error('サポートされていない画像形式です')
}
