/**
 * Node 用ポリフィル（installNodePolyfills）と画像コーデックの検証
 * GPU を使わないので、どの環境でも実行される
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeImage, encodeImage } from '../../src/node/image-codec'
import { installNodePolyfills } from '../../src/node/polyfills'

/** width x height を左上から順に塗った RGBA（画素ごとに異なる値） */
function gradient(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data.set([i * 7, i * 13, 255 - i, 128 + (i % 64)], i * 4)
  }
  return data
}

function row(data: Uint8ClampedArray, width: number, y: number): number[] {
  return Array.from(data.subarray(y * width * 4, (y + 1) * width * 4))
}

beforeAll(() => {
  installNodePolyfills()
})

describe('installNodePolyfills', () => {
  it('2 回目以降は何も追加しない（冪等）', () => {
    expect(installNodePolyfills()).toEqual([])
    expect(typeof OffscreenCanvas).toBe('function')
    expect(typeof createImageBitmap).toBe('function')
    expect(typeof FileReader).toBe('function')
    // DOM 前提の処理に入らないよう document は定義しない
    expect(typeof document).toBe('undefined')
  })
})

describe('image-codec', () => {
  it('PNG をエンコード → デコードすると同じ RGBA に戻る', () => {
    const image = { width: 5, height: 3, data: gradient(5, 3) }
    const { bytes, mimeType } = encodeImage(image, 'image/png')
    expect(mimeType).toBe('image/png')
    const decoded = decodeImage(bytes)
    expect(decoded.width).toBe(5)
    expect(decoded.height).toBe(3)
    expect(Array.from(decoded.data)).toEqual(Array.from(image.data))
  })

  it('bufferView のパディングで IEND の後ろにバイトが付いた PNG もデコードできる', () => {
    const image = { width: 2, height: 2, data: gradient(2, 2) }
    const { bytes } = encodeImage(image, 'image/png')
    const padded = new Uint8Array(bytes.length + 3)
    padded.set(bytes)
    expect(Array.from(decodeImage(padded).data)).toEqual(Array.from(image.data))
  })

  it('JPEG をエンコード → デコードできる（非可逆なので近似比較）', () => {
    const data = new Uint8ClampedArray(16 * 16 * 4)
    for (let i = 0; i < 16 * 16; i++) data.set([200, 100, 50, 255], i * 4)
    const { bytes, mimeType } = encodeImage(
      { width: 16, height: 16, data },
      'image/jpeg',
      0.95,
    )
    expect(mimeType).toBe('image/jpeg')
    const decoded = decodeImage(bytes)
    expect(decoded.width).toBe(16)
    expect(Math.abs(decoded.data[0] - 200)).toBeLessThanOrEqual(4)
    expect(Math.abs(decoded.data[1] - 100)).toBeLessThanOrEqual(4)
    expect(Math.abs(decoded.data[2] - 50)).toBeLessThanOrEqual(4)
  })

  it('PNG / JPEG 以外は例外にする', () => {
    expect(() => decodeImage(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toThrow(
      /未対応の画像形式/,
    )
  })
})

describe('createImageBitmap（ポリフィル）', () => {
  it('PNG の Blob をデコードし、imageOrientation: flipY で行を反転する', async () => {
    const image = { width: 3, height: 2, data: gradient(3, 2) }
    const { bytes } = encodeImage(image, 'image/png')
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
      type: 'image/png',
    })

    const normal = (await createImageBitmap(blob)) as unknown as {
      width: number
      height: number
      data: Uint8ClampedArray
    }
    expect(normal.width).toBe(3)
    expect(normal.height).toBe(2)
    expect(row(normal.data, 3, 0)).toEqual(row(image.data, 3, 0))

    const flipped = (await createImageBitmap(blob, {
      imageOrientation: 'flipY',
    })) as unknown as { data: Uint8ClampedArray }
    expect(row(flipped.data, 3, 0)).toEqual(row(image.data, 3, 1))
    expect(row(flipped.data, 3, 1)).toEqual(row(image.data, 3, 0))
  })

  it('デコードできないデータは reject する', async () => {
    await expect(
      createImageBitmap(new Blob([new Uint8Array([1, 2, 3, 4])])),
    ).rejects.toThrow(/未対応の画像形式/)
  })
})

describe('OffscreenCanvas（ポリフィル）', () => {
  it('WebGL / WebGPU のコンテキストは返さない', () => {
    const canvas = new OffscreenCanvas(1, 1)
    expect(canvas.getContext('webgl2')).toBeNull()
    expect(canvas.getContext('webgpu')).toBeNull()
  })

  it('putImageData → getImageData で同じ値が読める', () => {
    const canvas = new OffscreenCanvas(4, 2)
    const ctx = canvas.getContext('2d')!
    const data = gradient(4, 2)
    ctx.putImageData(new ImageData(data, 4, 2), 0, 0)
    expect(Array.from(ctx.getImageData(0, 0, 4, 2).data)).toEqual(
      Array.from(data),
    )
  })

  it('translate + scale(1, -1) してから drawImage すると上下反転して描かれる（GLTFExporter の flipY）', async () => {
    const source = { width: 3, height: 2, data: gradient(3, 2) }
    const blob = new Blob(
      [encodeImage(source, 'image/png').bytes as Uint8Array<ArrayBuffer>],
      { type: 'image/png' },
    )
    const bitmap = await createImageBitmap(blob)

    const canvas = new OffscreenCanvas(3, 2)
    const ctx = canvas.getContext('2d')!
    ctx.translate(0, canvas.height)
    ctx.scale(1, -1)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const out = ctx.getImageData(0, 0, 3, 2).data
    expect(row(out, 3, 0)).toEqual(row(source.data, 3, 1))
    expect(row(out, 3, 1)).toEqual(row(source.data, 3, 0))
  })

  it('convertToBlob で PNG を返し、デコードすると描いた内容に戻る', async () => {
    const canvas = new OffscreenCanvas(2, 2)
    const ctx = canvas.getContext('2d')!
    const data = gradient(2, 2)
    ctx.putImageData(new ImageData(data, 2, 2), 0, 0)

    const blob = await canvas.convertToBlob({ type: 'image/png' })
    expect(blob.type).toBe('image/png')
    const decoded = decodeImage(new Uint8Array(await blob.arrayBuffer()))
    expect(Array.from(decoded.data)).toEqual(Array.from(data))
  })
})

describe('FileReader（ポリフィル）', () => {
  it('readAsArrayBuffer / readAsDataURL の結果を onloadend で受け取れる', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'application/octet-stream',
    })

    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as ArrayBuffer)
      reader.readAsArrayBuffer(blob)
    })
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3])

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
    expect(dataUrl).toBe('data:application/octet-stream;base64,AQID')
  })
})
