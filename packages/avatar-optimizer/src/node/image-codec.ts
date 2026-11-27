/**
 * Node 用の画像デコード / エンコード（PNG: pngjs, JPEG: jpeg-js）
 *
 * どちらも純 JS 実装で、ネイティブモジュールを必要としない。
 * デコード結果は常に 8bit RGBA（行 0 = 画像の先頭行）に正規化する。
 */
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

/** デコード済みの RGBA 画像 */
export interface DecodedImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]
const JPEG_SIGNATURE = [0xff, 0xd8]
const IEND = new Uint8Array([0x49, 0x45, 0x4e, 0x44])

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, i) => bytes[i] === value)
}

/**
 * PNG / JPEG のバイト列を RGBA にデコードする
 *
 * @throws 未対応の形式（WebP など）や壊れたデータの場合
 */
export function decodeImage(bytes: Uint8Array): DecodedImage {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (startsWith(bytes, PNG_SIGNATURE)) {
    // glTF の bufferView は 4 バイト境界までパディングされるため、IEND 以降に
    // 余分なバイトが付くことがある。ブラウザは無視するが pngjs はエラーにするので切り詰める
    const iend = buffer.lastIndexOf(IEND)
    const trimmed = iend > 0 ? buffer.subarray(0, iend + 8) : buffer
    const png = PNG.sync.read(trimmed)
    return {
      width: png.width,
      height: png.height,
      data: new Uint8ClampedArray(
        png.data.buffer,
        png.data.byteOffset,
        png.data.byteLength,
      ),
    }
  }

  if (startsWith(bytes, JPEG_SIGNATURE)) {
    const image = jpeg.decode(buffer, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 4096,
    })
    return {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(
        image.data.buffer,
        image.data.byteOffset,
        image.data.byteLength,
      ),
    }
  }

  throw new Error(
    `未対応の画像形式です（先頭バイト: ${Array.from(bytes.subarray(0, 4), (b) => b.toString(16).padStart(2, '0')).join(' ')}）。PNG と JPEG のみ対応しています`,
  )
}

/**
 * RGBA を PNG / JPEG にエンコードする
 *
 * @param mimeType - 'image/jpeg' のときのみ JPEG、それ以外は PNG
 * @param quality - JPEG の品質（0〜1）
 */
export function encodeImage(
  image: DecodedImage,
  mimeType: string,
  quality?: number,
): { bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' } {
  const data = Buffer.from(
    image.data.buffer,
    image.data.byteOffset,
    image.data.byteLength,
  )

  if (mimeType === 'image/jpeg') {
    const encoded = jpeg.encode(
      { data, width: image.width, height: image.height },
      Math.round((quality ?? 0.92) * 100),
    )
    return { bytes: new Uint8Array(encoded.data), mimeType: 'image/jpeg' }
  }

  const png = new PNG({ width: image.width, height: image.height })
  png.data = data
  return { bytes: new Uint8Array(PNG.sync.write(png)), mimeType: 'image/png' }
}
