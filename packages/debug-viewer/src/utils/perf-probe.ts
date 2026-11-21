/**
 * 描画性能プローブ（`?perfprobe=1`）の共通処理
 *
 * 手元で操作できないブラウザ（Safari・Quest など）で起きる描画の問題を調べるため、
 * 計測結果・console.error / warn・WebGPU のエラー・UI 操作を dev サーバーの
 * `/__perf-log` に送る。dev サーバー側は vite.config.ts の perfLogPlugin が
 * `node_modules/.cache/perf-log.jsonl` に JSON Lines で追記する。
 *
 * 開発ビルドかつ `?perfprobe=1` のときだけ有効。React コンポーネントは
 * components/PerfProbe.tsx にある（Fast Refresh のため非コンポーネントと分けている）。
 */

/** 開発ビルドで `?perfprobe=1` が付いているときだけ true */
export const perfProbeEnabled = import.meta.env.DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('perfprobe') === '1'

/**
 * 1 件の記録を dev サーバーへ送る
 *
 * @param kind - 記録の種類（env / stage / monitor / gpu-error など）
 * @param data - JSON に変換できる値
 */
export function postPerfLog(kind: string, data: unknown): void
{
  void fetch('/__perf-log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, time: new Date().toISOString(), data }),
  })
}

/** 長いメッセージ（Metal のコンパイルエラーなど）をエラー行と末尾に絞る */
function summarizeLongMessage(message: string)
{
  const lines = message.split('\n')
  return {
    head: message.slice(0, 300),
    length: message.length,
    // WebKit が配列添字の範囲チェックとして入れる __wgslMin の数（入れ子の深さの目安）
    wgslMinCount: message.split('__wgslMin(').length - 1,
    errorLines: lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /error|warning|note:/i.test(line))
      .slice(0, 30)
      .map(({ line, index }) => ({
        index,
        text: line.slice(0, 500),
        context: lines.slice(Math.max(0, index - 2), index + 3).join('\n').slice(0, 1200),
      })),
    tail: message.slice(-3000),
  }
}

/**
 * console.error / warn と UI 操作を dev サーバーへ転送する
 * three.js はパイプライン生成の失敗を console.error で報告するため、これで拾える。
 * 同じ文言は 3 回までに抑える
 */
function installConsoleAndUiCapture(): void
{
  const seen = new Map<string, number>()
  for (const level of ['error', 'warn'] as const)
  {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) =>
    {
      original(...args)
      const message = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ')
      // Metal のエラーは先頭が共通の生成コードなので、末尾も含めて同一判定する
      const key = message.slice(0, 100) + message.slice(-200)
      const count = (seen.get(key) ?? 0) + 1
      seen.set(key, count)
      if (count > 3) return
      postPerfLog(`console-${level}`, message.length <= 4000 ? message : summarizeLongMessage(message))
    }
  }

  const describeTarget = (target: EventTarget | null) =>
  {
    const element = target as HTMLElement | null
    if (!element?.tagName) return null
    const input = element as HTMLInputElement
    return {
      tag: element.tagName,
      text: (element.textContent ?? '').trim().slice(0, 60),
      label: element.closest('label')?.textContent?.trim().slice(0, 60),
      value: input.type === 'checkbox' ? input.checked : input.value,
    }
  }
  document.addEventListener('click', (event) =>
  {
    const target = describeTarget(event.target)
    if (target?.tag === 'BUTTON') postPerfLog('ui-click', target)
  }, true)
  document.addEventListener('change', (event) => postPerfLog('ui-change', describeTarget(event.target)), true)
}

// HMR でモジュールが再評価されても二重にフックしない
const CAPTURE_FLAG = '__perfProbeCaptureInstalled'
if (perfProbeEnabled && !(window as unknown as Record<string, unknown>)[CAPTURE_FLAG])
{
  (window as unknown as Record<string, unknown>)[CAPTURE_FLAG] = true
  installConsoleAndUiCapture()
}

/**
 * 計測で触る GPUDevice の最小限の形
 * three r187 の @types/three は @webgpu/types を読み込まなくなったため、使う部分だけ定義する
 */
export interface ProbeGPUDevice extends EventTarget
{
  createRenderPipeline: (descriptor: unknown) => unknown
  createRenderPipelineAsync: (descriptor: unknown) => Promise<unknown>
  createShaderModule: (descriptor: { code: string; label?: string }) => ProbeShaderModule
  queue: { onSubmittedWorkDone: () => Promise<undefined> }
}

interface ProbeShaderModule
{
  getCompilationInfo: () => Promise<{
    messages: readonly { type: 'error' | 'warning' | 'info'; message: string; lineNum: number }[]
  }>
}

let pipelineCreations = 0

/** 前回のリセット以降に作られたレンダーパイプラインの数（毎フレーム作り直されていないかの確認用） */
export function takePipelineCreations(): number
{
  const count = pipelineCreations
  pipelineCreations = 0
  return count
}

const hookedDevices = new WeakSet<ProbeGPUDevice>()

/**
 * GPUDevice にフックを入れ、パイプライン生成回数・シェーダーのコンパイルエラー・
 * 捕捉されなかった WebGPU エラーを記録する。同じデバイスには一度だけ入れる
 *
 * @param device - three.js の WebGPU バックエンドが使う GPUDevice
 */
export function installDeviceCapture(device: ProbeGPUDevice): void
{
  if (hookedDevices.has(device)) return
  hookedDevices.add(device)

  const createPipeline = device.createRenderPipeline.bind(device)
  device.createRenderPipeline = (descriptor) =>
  {
    pipelineCreations++
    return createPipeline(descriptor)
  }
  const createPipelineAsync = device.createRenderPipelineAsync.bind(device)
  device.createRenderPipelineAsync = (descriptor) =>
  {
    pipelineCreations++
    return createPipelineAsync(descriptor)
  }

  const createShaderModule = device.createShaderModule.bind(device)
  device.createShaderModule = (descriptor) =>
  {
    const module = createShaderModule(descriptor)
    void module.getCompilationInfo().then((info) =>
    {
      const messages = info.messages.filter((message) => message.type !== 'info')
      if (messages.length === 0) return
      const lines = descriptor.code.split('\n')
      postPerfLog('shader-compile', {
        label: descriptor.label,
        lineCount: lines.length,
        messages: messages.slice(0, 5).map((message) => ({
          type: message.type,
          text: message.message,
          line: message.lineNum,
          source: lines.slice(Math.max(0, message.lineNum - 3), message.lineNum + 2).join('\n'),
        })),
      })
    })
    return module
  }

  device.addEventListener('uncapturederror', (event) =>
  {
    postPerfLog('gpu-error', (event as Event & { error: { message: string } }).error.message)
  })
}
