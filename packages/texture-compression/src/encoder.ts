/**
 * BasisEncoder WASM モジュールのロードと管理
 * ブラウザ環境専用
 */

import { ResultAsync } from 'neverthrow'
// @ts-expect-error - Vite ?url import
import wasmUrl from '../wasm/basis_encoder.wasm?url'
// @ts-expect-error - Emscripten module
import BASIS from '../wasm/basis_encoder.js'
import { BasisEncoderModule, CompressionError } from './types'

/** モジュールキャッシュ */
let cachedModule: BasisEncoderModule | null = null

/**
 * BasisEncoder WASMモジュールを初期化（ブラウザ環境専用）
 *
 * @returns 初期化されたBasisEncoderModule
 */
export function initBasisEncoder(): ResultAsync<
  BasisEncoderModule,
  CompressionError
> {
  // キャッシュがあれば返す
  if (cachedModule) {
    return ResultAsync.fromSafePromise(Promise.resolve(cachedModule))
  }

  return ResultAsync.fromPromise(loadBasisModule(), (error) => ({
    type: 'WASM_LOAD_ERROR' as const,
    message: `Basis WASM モジュールの読み込みに失敗: ${error instanceof Error ? error.message : String(error)}`,
  })).map((module) => {
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

/** 拡張されたモジュール型（initializeBasisを含む） */
interface BasisEncoderModuleWithInit extends BasisEncoderModule {
  initializeBasis?: () => void
}

/**
 * BASISモジュールをロード
 * locateFileでWASMのURLを指定
 */
async function loadBasisModule(): Promise<BasisEncoderModule> {
  const moduleObj = (await BASIS({
    locateFile: () => wasmUrl,
  })) as BasisEncoderModuleWithInit

  // Basisエンコーダーの初期化（必須）
  if (moduleObj.initializeBasis) {
    moduleObj.initializeBasis()
  }

  // BasisEncoderクラスが存在するか確認
  if (!moduleObj.BasisEncoder) {
    throw new Error('BasisEncoder class not found in module after init')
  }

  return moduleObj as BasisEncoderModule
}
