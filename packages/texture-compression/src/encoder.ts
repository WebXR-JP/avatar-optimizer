/**
 * BasisEncoder WASM モジュールのロードと管理
 * WASM の読み込み元は wasm-source.ts（ブラウザ）/ wasm-source.node.ts（Node）で切り替わる
 */

import { ResultAsync } from 'neverthrow'
// @ts-expect-error - Emscripten module
import BASIS from '../wasm/basis_encoder.js'
import { BasisEncoderModule, CompressionError } from './types'
import { getBasisModuleArg } from './wasm-source'

/** モジュールキャッシュ */
let cachedModule: BasisEncoderModule | null = null

/**
 * BasisEncoder WASMモジュールを初期化
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
 * WASM の場所（ブラウザ）またはバイト列（Node）は getBasisModuleArg が決める
 */
async function loadBasisModule(): Promise<BasisEncoderModule> {
  const moduleObj = (await BASIS(
    await getBasisModuleArg(),
  )) as BasisEncoderModuleWithInit

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
