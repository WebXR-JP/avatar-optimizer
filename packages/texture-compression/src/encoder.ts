/**
 * BasisEncoder WASM モジュールのロードと管理
 * ブラウザ環境専用
 */

import { ResultAsync } from 'neverthrow'
import {
  BasisEncoderModule,
  BasisModuleFactory,
  CompressionError,
} from './types'

/** モジュールキャッシュ */
let cachedModule: BasisEncoderModule | null = null

/** デフォルトのWASMパス（パッケージルートからの相対パス） */
const DEFAULT_WASM_DIR = new URL('../wasm/', import.meta.url).href

/**
 * BasisEncoder WASMモジュールを初期化（ブラウザ環境専用）
 *
 * @param wasmDir - WASMファイルのディレクトリURL（末尾/必須）
 * @returns 初期化されたBasisEncoderModule
 */
export function initBasisEncoder(
  wasmDir?: string,
): ResultAsync<BasisEncoderModule, CompressionError> {
  // キャッシュがあれば返す
  if (cachedModule) {
    return ResultAsync.fromSafePromise(Promise.resolve(cachedModule))
  }

  return ResultAsync.fromPromise(
    loadBasisModule(wasmDir ?? DEFAULT_WASM_DIR),
    (error) => ({
      type: 'WASM_LOAD_ERROR' as const,
      message: `Basis WASM モジュールの読み込みに失敗: ${error instanceof Error ? error.message : String(error)}`,
    }),
  ).map((module) => {
    cachedModule = module
    return module
  })
}

/**
 * BasisEncoderモジュールを解放
 */
export function disposeBasisEncoder(): void {
  cachedModule = null
}

/**
 * キャッシュされたモジュールを取得（初期化済みの場合のみ）
 */
export function getCachedBasisEncoder(): BasisEncoderModule | null {
  return cachedModule
}

/**
 * WASMがすでにロード済みかチェック
 */
export function isBasisEncoderReady(): boolean {
  return cachedModule !== null
}

/**
 * ブラウザ環境でBASISモジュールをロード
 * scriptタグを使ってグローバルスコープにロード
 */
async function loadBasisModule(wasmDir: string): Promise<BasisEncoderModule> {
  const jsUrl = new URL('basis_encoder.js', wasmDir).href

  // グローバルに既にBASISがあればそれを使う
  const globalObj = globalThis as unknown as { BASIS?: BasisModuleFactory }
  if (globalObj.BASIS) {
    return initializeModule(globalObj.BASIS, wasmDir)
  }

  // scriptタグを使って動的にロード
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = jsUrl
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load script: ${jsUrl}`))
    document.head.appendChild(script)
  })

  // ロード後、グローバルのBASISを取得
  const basisFactory = globalObj.BASIS
  if (!basisFactory) {
    throw new Error('BASIS is not defined after script load')
  }

  return initializeModule(basisFactory, wasmDir)
}

/** 拡張されたモジュール型（initializeBasisを含む） */
interface BasisEncoderModuleWithInit extends BasisEncoderModule {
  initializeBasis?: () => void
}

/**
 * BasisModuleFactoryからモジュールを初期化
 */
async function initializeModule(
  basisFactory: BasisModuleFactory,
  wasmDir: string,
): Promise<BasisEncoderModule> {
  const module = (await basisFactory({
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) {
        return new URL(path, wasmDir).href
      }
      return path
    },
  })) as BasisEncoderModuleWithInit

  // Basisエンコーダーの初期化（必須）
  if (module.initializeBasis) {
    module.initializeBasis()
  }

  return module
}
