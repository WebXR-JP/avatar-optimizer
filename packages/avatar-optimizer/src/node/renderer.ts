/**
 * Node でアトラス合成に使う WebGPURenderer を作る
 *
 * 画面へは描かず、合成用のオフスクリーン RenderTarget にだけ描画する。
 * GPUDevice は `webgpu`（Dawn）パッケージなど利用側で用意したものを受け取る。
 */
import { errAsync, ResultAsync } from 'neverthrow'
import { WebGPURenderer } from 'three/webgpu'
import type {
  NodeAtlasRendererOptions,
  NodeGPUDevice,
  OptimizationError,
} from '../types'

/** WebGPURenderer の内部が参照する WebGPU のグローバル定数 */
const REQUIRED_WEBGPU_GLOBALS = [
  'GPUBufferUsage',
  'GPUTextureUsage',
  'GPUMapMode',
  'GPUShaderStage',
] as const

/**
 * レンダラーが生きている間、GPU / アダプタへの参照を保持する
 *
 * Dawn（`webgpu` パッケージ）は `create()` が返した GPU オブジェクトが GC されると
 * インスタンスごと破棄され、使用中のデバイスでネイティブクラッシュする。
 * 利用側が `createNodeAtlasRenderer({ gpu: create([]) })` のように参照を残さなくても
 * 安全なように、レンダラーをキーにして保持しておく。
 */
const gpuKeepAlive = new WeakMap<WebGPURenderer, unknown>()

/**
 * アトラス合成用の WebGPURenderer を作成して初期化する
 *
 * 事前に `installNodePolyfills()` を呼び、`webgpu` パッケージの `globals` を
 * globalThis に展開しておく必要がある。
 * 返したレンダラーは `optimizeModel(vrm, { atlas: { renderer } })` に渡し、
 * 使い終わったら `renderer.dispose()` で破棄する。
 *
 * @param options - 使う GPUDevice、または GPUDevice を作るための GPU
 * @returns 初期化済みで WebGPU バックエンドが有効なレンダラー
 */
export function createNodeAtlasRenderer(
  options: NodeAtlasRendererOptions,
): ResultAsync<WebGPURenderer, OptimizationError> {
  const g = globalThis as Record<string, unknown>
  const missing = REQUIRED_WEBGPU_GLOBALS.filter(
    (name) => g[name] === undefined,
  )
  if (missing.length > 0) {
    return errAsync({
      type: 'INVALID_OPERATION',
      message:
        `WebGPU のグローバル定数（${missing.join(', ')}）がありません。` +
        'webgpu パッケージの globals を Object.assign(globalThis, globals) で展開してから呼んでください',
    })
  }
  if (g.self === undefined || g.OffscreenCanvas === undefined) {
    return errAsync({
      type: 'INVALID_OPERATION',
      message:
        'Node 用のポリフィルが未導入です。先に installNodePolyfills() を呼んでください',
    })
  }

  return resolveDevice(options).andThen(({ device, keepAlive }) =>
    ResultAsync.fromPromise(
      (async () => {
        // 画面出力はしないので 1x1 のダミーキャンバスでよい
        const canvas = new OffscreenCanvas(1, 1)
        const renderer = new WebGPURenderer({
          canvas: canvas as unknown as HTMLCanvasElement,
          // three の型は @webgpu/types の GPUDevice を要求するため、ここでだけ合わせる
          device: device as never,
          antialias: false,
          alpha: true,
        })
        await renderer.init()
        const backend = renderer.backend as { isWebGPUBackend?: boolean }
        if (backend.isWebGPUBackend !== true) {
          renderer.dispose()
          throw new Error('WebGPU バックエンドを初期化できませんでした')
        }
        gpuKeepAlive.set(renderer, keepAlive)
        return renderer
      })(),
      (error): OptimizationError => ({
        type: 'INTERNAL_ERROR',
        message: `アトラス用 WebGPURenderer の初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      }),
    ),
  )
}

/**
 * options から GPUDevice を得る（device 指定を優先し、無ければ gpu から要求する）
 *
 * @returns デバイスと、デバイスより先に GC させてはいけないオブジェクト
 */
function resolveDevice(
  options: NodeAtlasRendererOptions,
): ResultAsync<
  { device: NodeGPUDevice; keepAlive: unknown },
  OptimizationError
> {
  if (options.device) {
    return ResultAsync.fromSafePromise(
      Promise.resolve({ device: options.device, keepAlive: options.gpu }),
    )
  }
  const { gpu } = options
  if (!gpu) {
    return errAsync({
      type: 'INVALID_PARAMETER',
      message: 'device か gpu のどちらかを指定してください',
    })
  }

  return ResultAsync.fromPromise(
    (async () => {
      const adapter = await gpu.requestAdapter(options.adapterOptions)
      if (!adapter) {
        throw new Error(
          'GPU アダプタが見つかりません（Vulkan / Metal / D3D12 ドライバ、または lavapipe などのソフトウェア実装が必要です）',
        )
      }
      const device = await adapter.requestDevice()
      return { device, keepAlive: [gpu, adapter] }
    })(),
    (error): OptimizationError => ({
      type: 'INTERNAL_ERROR',
      message: `GPUDevice を取得できませんでした: ${error instanceof Error ? error.message : String(error)}`,
    }),
  )
}
