/**
 * Node で loadVRM / optimizeModel / exportVRM を動かすためのブラウザ API ポリフィル
 *
 * three.js の GLTFLoader / GLTFExporter と WebGPURenderer、mtoon-atlas の書き出しが
 * 参照するグローバルのうち、Node に無いものだけを最小限に補う。既に存在するものは上書きしない。
 *
 * - createImageBitmap / ImageBitmap: PNG / JPEG をデコードし、RGBA を `data` に持つ画像を返す
 *   （GLTFExporter や mtoon-atlas はこれを DataTexture と同じ経路で扱う）
 * - OffscreenCanvas: 2D コンテキストの一部（putImageData / getImageData / drawImage /
 *   translate / scale など）と convertToBlob のみ。WebGL / WebGPU コンテキストは返さない
 * - ImageData / FileReader / ProgressEvent
 * - self / requestAnimationFrame / cancelAnimationFrame: WebGPURenderer の内部ループ用。
 *   タイマーは unref するので、プロセスの終了を妨げない
 *
 * document / HTMLCanvasElement / HTMLImageElement は定義しない
 * （定義するとライブラリ側がブラウザと誤認して DOM 前提の処理に入るため）。
 */
import { type DecodedImage, decodeImage, encodeImage } from './image-codec'

type Globals = Record<string, unknown>

/** RGBA を data に持つ ImageBitmap 相当（行 0 = 画像の先頭行） */
class NodeImageBitmap implements DecodedImage {
  constructor(
    public readonly width: number,
    public readonly height: number,
    public data: Uint8ClampedArray,
  ) {}

  close(): void {
    this.data = new Uint8ClampedArray(0)
  }
}

class NodeImageData implements DecodedImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
  readonly colorSpace = 'srgb'

  constructor(
    dataOrWidth: Uint8ClampedArray | number,
    widthOrHeight: number,
    height?: number,
  ) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth
      this.height = widthOrHeight
      this.data = new Uint8ClampedArray(this.width * this.height * 4)
    } else {
      this.data = dataOrWidth
      this.width = widthOrHeight
      this.height = height ?? dataOrWidth.length / 4 / widthOrHeight
    }
  }
}

/** drawImage で描ける画像（RGBA を持つもの） */
type DrawableSource = DecodedImage | NodeOffscreenCanvas

function flipRows(image: DecodedImage): Uint8ClampedArray {
  const rowBytes = image.width * 4
  const out = new Uint8ClampedArray(image.data.length)
  for (let y = 0; y < image.height; y++) {
    out.set(
      image.data.subarray(y * rowBytes, (y + 1) * rowBytes),
      (image.height - 1 - y) * rowBytes,
    )
  }
  return out
}

/**
 * 2D コンテキストの最小実装
 * 変換行列はアフィン変換（translate / scale / setTransform）のみ扱う。
 * 合成モードは source-over（不透明として上書き）のみで、アルファブレンドはしない
 */
class NodeCanvasRenderingContext2D {
  private matrix: [number, number, number, number, number, number] = [
    1, 0, 0, 1, 0, 0,
  ]

  private stack: Array<[number, number, number, number, number, number]> = []

  fillStyle = '#000000'

  globalCompositeOperation = 'source-over'

  imageSmoothingEnabled = true

  constructor(readonly canvas: NodeOffscreenCanvas) {}

  save(): void {
    this.stack.push([...this.matrix])
  }

  restore(): void {
    this.matrix = this.stack.pop() ?? this.matrix
  }

  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void {
    this.matrix = [a, b, c, d, e, f]
  }

  resetTransform(): void {
    this.matrix = [1, 0, 0, 1, 0, 0]
  }

  translate(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.matrix
    this.matrix = [a, b, c, d, e + a * x + c * y, f + b * x + d * y]
  }

  scale(sx: number, sy: number): void {
    const [a, b, c, d, e, f] = this.matrix
    this.matrix = [a * sx, b * sx, c * sy, d * sy, e, f]
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.fill(x, y, w, h, [0, 0, 0, 0])
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const match = /^#([0-9a-f]{6})$/i.exec(this.fillStyle)
    const rgb = match
      ? [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16))
      : [0, 0, 0]
    this.fill(x, y, w, h, [rgb[0], rgb[1], rgb[2], 255])
  }

  private fill(
    x: number,
    y: number,
    w: number,
    h: number,
    rgba: number[],
  ): void {
    const { width, height } = this.canvas
    const pixels = this.canvas.pixels()
    for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
      for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
        pixels.set(rgba, (py * width + px) * 4)
      }
    }
  }

  createImageData(width: number, height: number): NodeImageData {
    return new NodeImageData(width, height)
  }

  /** 変換行列の影響を受けずにそのまま書き込む（Canvas 仕様どおり） */
  putImageData(image: DecodedImage, dx = 0, dy = 0): void {
    const { width, height } = this.canvas
    const pixels = this.canvas.pixels()
    const rowBytes = image.width * 4
    for (let y = 0; y < image.height; y++) {
      const ty = y + dy
      if (ty < 0 || ty >= height) continue
      const row = image.data.subarray(y * rowBytes, (y + 1) * rowBytes)
      const start = Math.max(0, -dx)
      const end = Math.min(image.width, width - dx)
      if (end <= start) continue
      pixels.set(
        row.subarray(start * 4, end * 4),
        (ty * width + dx + start) * 4,
      )
    }
  }

  getImageData(x: number, y: number, w: number, h: number): NodeImageData {
    const { width } = this.canvas
    const pixels = this.canvas.pixels()
    const out = new Uint8ClampedArray(w * h * 4)
    for (let row = 0; row < h; row++) {
      const offset = ((y + row) * width + x) * 4
      out.set(pixels.subarray(offset, offset + w * 4), row * w * 4)
    }
    return new NodeImageData(out, w, h)
  }

  /**
   * 画像を描画する（最近傍補間）
   * drawImage(image, dx, dy) / drawImage(image, dx, dy, dw, dh) の形式のみ対応
   */
  drawImage(
    image: DrawableSource,
    dx = 0,
    dy = 0,
    dw?: number,
    dh?: number,
  ): void {
    const source =
      image instanceof NodeOffscreenCanvas ? image.pixels() : image.data
    if (!source || source.length === 0) {
      throw new Error('drawImage: 画像のピクセルデータがありません')
    }
    const drawWidth = dw ?? image.width
    const drawHeight = dh ?? image.height
    const [a, b, c, d, e, f] = this.matrix
    const det = a * d - b * c
    if (det === 0) return

    const { width, height } = this.canvas
    const pixels = this.canvas.pixels()
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        // ピクセル中心をユーザー座標へ逆変換して元画像の画素を引く
        const X = px + 0.5 - e
        const Y = py + 0.5 - f
        const ux = (d * X - c * Y) / det
        const uy = (-b * X + a * Y) / det
        const sx = Math.floor(((ux - dx) / drawWidth) * image.width)
        const sy = Math.floor(((uy - dy) / drawHeight) * image.height)
        if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height)
          continue
        const si = (sy * image.width + sx) * 4
        const di = (py * width + px) * 4
        pixels[di] = source[si]
        pixels[di + 1] = source[si + 1]
        pixels[di + 2] = source[si + 2]
        pixels[di + 3] = source[si + 3]
      }
    }
  }
}

/** 2D 描画と convertToBlob のみを持つ OffscreenCanvas */
class NodeOffscreenCanvas {
  private canvasWidth: number

  private canvasHeight: number

  private buffer: Uint8ClampedArray | null = null

  private context: NodeCanvasRenderingContext2D | null = null

  constructor(width: number, height: number) {
    this.canvasWidth = width
    this.canvasHeight = height
  }

  get width(): number {
    return this.canvasWidth
  }

  set width(value: number) {
    this.canvasWidth = value
    this.buffer = null
  }

  get height(): number {
    return this.canvasHeight
  }

  set height(value: number) {
    this.canvasHeight = value
    this.buffer = null
  }

  /** RGBA バッファ（サイズ変更後は透明で作り直す） */
  pixels(): Uint8ClampedArray {
    const size = this.canvasWidth * this.canvasHeight * 4
    if (!this.buffer || this.buffer.length !== size) {
      this.buffer = new Uint8ClampedArray(size)
    }
    return this.buffer
  }

  /** '2d' 以外（webgl / webgl2 / webgpu）は null を返す */
  getContext(type: string): NodeCanvasRenderingContext2D | null {
    if (type !== '2d') return null
    this.context ??= new NodeCanvasRenderingContext2D(this)
    return this.context
  }

  async convertToBlob(
    options: { type?: string; quality?: number } = {},
  ): Promise<Blob> {
    const { bytes, mimeType } = encodeImage(
      { width: this.width, height: this.height, data: this.pixels() },
      options.type ?? 'image/png',
      options.quality,
    )
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType })
  }

  addEventListener(): void {}

  removeEventListener(): void {}
}

/** createImageBitmap(blob | ImageData, options) の Node 実装 */
async function createImageBitmapForNode(
  source: Blob | DecodedImage,
  options: { imageOrientation?: string } = {},
): Promise<NodeImageBitmap> {
  let image: DecodedImage
  if (source instanceof Blob) {
    image = decodeImage(new Uint8Array(await source.arrayBuffer()))
  } else if (source instanceof NodeOffscreenCanvas) {
    image = {
      width: source.width,
      height: source.height,
      data: source.pixels().slice(),
    }
  } else if (source && source.data && source.width && source.height) {
    image = {
      width: source.width,
      height: source.height,
      data: source.data.slice(),
    }
  } else {
    throw new TypeError(
      'createImageBitmap: Blob または ImageData を渡してください',
    )
  }

  const data =
    options.imageOrientation === 'flipY' ? flipRows(image) : image.data
  return new NodeImageBitmap(image.width, image.height, data)
}

/** GLTFExporter が使う onloadend / result だけを持つ FileReader */
class NodeFileReader {
  result: ArrayBuffer | string | null = null

  error: unknown = null

  readyState = 0

  onload: ((event: { target: NodeFileReader }) => void) | null = null

  onloadend: ((event: { target: NodeFileReader }) => void) | null = null

  onerror: ((event: { target: NodeFileReader }) => void) | null = null

  readAsArrayBuffer(blob: Blob): void {
    this.read(blob.arrayBuffer())
  }

  readAsDataURL(blob: Blob): void {
    this.read(
      blob
        .arrayBuffer()
        .then(
          (buffer) =>
            `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`,
        ),
    )
  }

  private read(promise: Promise<ArrayBuffer | string>): void {
    this.readyState = 1
    promise.then(
      (result) => {
        this.result = result
        this.readyState = 2
        this.onload?.({ target: this })
        this.onloadend?.({ target: this })
      },
      (error: unknown) => {
        this.error = error
        this.readyState = 2
        this.onerror?.({ target: this })
        this.onloadend?.({ target: this })
      },
    )
  }
}

class NodeProgressEvent extends Event {
  readonly lengthComputable: boolean

  readonly loaded: number

  readonly total: number

  constructor(
    type: string,
    init: { lengthComputable?: boolean; loaded?: number; total?: number } = {},
  ) {
    super(type)
    this.lengthComputable = init.lengthComputable ?? false
    this.loaded = init.loaded ?? 0
    this.total = init.total ?? 0
  }
}

/**
 * Node に足りないブラウザ API を globalThis に追加する（冪等）
 *
 * loadVRM / optimizeModel / exportVRM と createNodeAtlasRenderer より前に 1 回呼ぶ。
 * WebGPU 自体（GPUBufferUsage などの定数と GPUDevice）は `webgpu` パッケージなど
 * 利用側で用意する。
 *
 * @returns 新たに追加したグローバル名の一覧
 */
export function installNodePolyfills(): string[] {
  const g = globalThis as unknown as Globals
  const installed: string[] = []
  const define = (name: string, value: unknown) => {
    if (g[name] === undefined) {
      g[name] = value
      installed.push(name)
    }
  }

  // WebGPURenderer の Animation は生成時に self を requestAnimationFrame の文脈として掴む
  define('self', globalThis)
  define('requestAnimationFrame', (callback: (time: number) => void) => {
    const timer = setTimeout(() => callback(performance.now()), 16)
    timer.unref()
    return timer
  })
  define('cancelAnimationFrame', (timer: ReturnType<typeof setTimeout>) => {
    clearTimeout(timer)
  })
  define('ProgressEvent', NodeProgressEvent)
  define('FileReader', NodeFileReader)
  define('ImageData', NodeImageData)
  define('ImageBitmap', NodeImageBitmap)
  define('createImageBitmap', createImageBitmapForNode)
  define('OffscreenCanvas', NodeOffscreenCanvas)

  return installed
}
