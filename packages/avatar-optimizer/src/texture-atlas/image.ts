import { Matrix3 } from 'three'
import type { Matrix } from './types'
import type { Canvas, Image } from 'canvas'

/** Three.js互換の画像ソース */
export type AtlasImageSource = CanvasImageSource | Image

/** Image + UV変換行列のペア */
export interface ImageMatrixPair
{
  image: AtlasImageSource
  uvTransform: Matrix
  opacity?: number
}

/** 合成時のオプション */
export interface ComposeImageOptions
{
  width: number
  height: number
  backgroundColor?: string
  flipY?: boolean
}

type CanvasLike = HTMLCanvasElement | OffscreenCanvas | Canvas
type ContextLike = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const DEFAULT_BG = 'rgba(0,0,0,0)'

/**
 * Three.jsのMatrix3を利用してImageを合成する
 */
export async function composeImagesToAtlas(
  layers: ImageMatrixPair[],
  options: ComposeImageOptions,
): Promise<Uint8Array>
{
  const { width, height, backgroundColor = DEFAULT_BG, flipY = false } = options

  if (width <= 0 || height <= 0)
  {
    throw new Error('Atlas size must be positive')
  }

  const surface = await createDrawingSurface(width, height)
  const ctx = surface.context

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (backgroundColor)
  {
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, width, height)
  }
  ctx.restore()

  for (const layer of layers)
  {
    const { width: imgWidth, height: imgHeight } = getImageSize(layer.image)
    if (imgWidth <= 0 || imgHeight <= 0)
    {
      continue
    }

    const drawMatrix = buildCanvasTransform(
      layer.uvTransform,
      imgWidth,
      imgHeight,
      width,
      height,
      flipY,
    )

    const [a, b, c, d, e, f] = matrixToCanvasTransform(drawMatrix)

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.transform(a, b, c, d, e, f)
    ctx.globalAlpha = layer.opacity ?? 1
    ctx.drawImage(layer.image as CanvasImageSource, 0, 0, imgWidth, imgHeight)
    ctx.restore()
  }

  return surface.toPNG()
}

function buildCanvasTransform(
  uvTransform: Matrix,
  sourceWidth: number,
  sourceHeight: number,
  atlasWidth: number,
  atlasHeight: number,
  flipY: boolean,
): Matrix3
{
  const matrix = new Matrix3().fromArray(uvTransform)
  const pixelsToUV = new Matrix3().set(
    1 / sourceWidth,
    0,
    0,
    0,
    1 / sourceHeight,
    0,
    0,
    0,
    1,
  )

  const uvToCanvas = flipY
    ? new Matrix3().set(
      atlasWidth,
      0,
      0,
      0,
      -atlasHeight,
      atlasHeight,
      0,
      0,
      1,
    )
    : new Matrix3().set(
      atlasWidth,
      0,
      0,
      0,
      atlasHeight,
      0,
      0,
      0,
      1,
    )

  const transformed = matrix.clone().multiply(pixelsToUV)
  transformed.premultiply(uvToCanvas)
  return transformed
}

function matrixToCanvasTransform(matrix: Matrix3): [number, number, number, number, number, number]
{
  const e = matrix.elements
  return [e[0], e[1], e[3], e[4], e[6], e[7]]
}

function getImageSize(image: AtlasImageSource): { width: number; height: number }
{
  const anyImage = image as any
  const width = pickNumber(anyImage.width ?? anyImage.naturalWidth ?? anyImage.videoWidth)
  const height = pickNumber(anyImage.height ?? anyImage.naturalHeight ?? anyImage.videoHeight)

  if (!width || !height)
  {
    throw new Error('Source image must expose width and height')
  }

  return { width, height }
}

function pickNumber(value: unknown): number | null
{
  if (typeof value === 'number' && Number.isFinite(value))
  {
    return value
  }
  return null
}

interface DrawingSurface
{
  canvas: CanvasLike
  context: ContextLike
  toPNG: () => Promise<Uint8Array>
}

async function createDrawingSurface(width: number, height: number): Promise<DrawingSurface>
{
  if (typeof document !== 'undefined' && typeof document.createElement === 'function')
  {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context)
    {
      throw new Error('Failed to acquire 2D context')
    }
    return {
      canvas,
      context,
      toPNG: () => canvasToPng(canvas),
    }
  }

  if (typeof OffscreenCanvas !== 'undefined')
  {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context)
    {
      throw new Error('Failed to acquire 2D context')
    }
    return {
      canvas,
      context,
      toPNG: () => canvasToPng(canvas),
    }
  }

  const canvasModule = await loadNodeCanvasModule()
  const canvas = canvasModule.createCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context)
  {
    throw new Error('Failed to acquire 2D context')
  }
  return {
    canvas,
    context: context as ContextLike,
    toPNG: () => canvasToPng(canvas),
  }
}

function isNodeCanvas(canvas: CanvasLike): canvas is Canvas
{
  return typeof (canvas as Canvas).toBuffer === 'function'
}

function isHTMLCanvas(canvas: CanvasLike): canvas is HTMLCanvasElement
{
  return typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement
}

function isOffscreen(canvas: CanvasLike): canvas is OffscreenCanvas
{
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas
}

async function canvasToPng(canvas: CanvasLike): Promise<Uint8Array>
{
  if (isNodeCanvas(canvas))
  {
    return new Uint8Array(canvas.toBuffer('image/png'))
  }

  if (isOffscreen(canvas) && typeof canvas.convertToBlob === 'function')
  {
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return new Uint8Array(await blob.arrayBuffer())
  }

  if (isHTMLCanvas(canvas))
  {
    if (typeof canvas.toBlob === 'function')
    {
      const blob = await new Promise<Blob>((resolve, reject) =>
      {
        canvas.toBlob((value) =>
        {
          if (!value)
          {
            reject(new Error('Failed to export canvas'))
            return
          }
          resolve(value)
        }, 'image/png')
      })
      return new Uint8Array(await blob.arrayBuffer())
    }

    const dataUrl = canvas.toDataURL('image/png')
    return dataURLToUint8Array(dataUrl)
  }

  throw new Error('Unsupported canvas implementation')
}

function dataURLToUint8Array(dataUrl: string): Uint8Array
{
  const base64 = dataUrl.split(',')[1] ?? ''
  if (typeof atob !== 'function')
  {
    throw new Error('Base64 decoding not available')
  }
  const binary = atob(base64)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
  {
    buffer[i] = binary.charCodeAt(i)
  }
  return buffer
}

type CanvasModule = typeof import('canvas')
let canvasModulePromise: Promise<CanvasModule> | null = null

async function loadNodeCanvasModule(): Promise<CanvasModule>
{
  if (!canvasModulePromise)
  {
    canvasModulePromise = import('canvas')
  }
  return canvasModulePromise
}
