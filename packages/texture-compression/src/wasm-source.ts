/**
 * Basis エンコーダー WASM の読み込み元（ブラウザ / バンドラー向け）
 *
 * Vite の `?url` で WASM の配信 URL を得て、Emscripten の locateFile に渡す。
 * Node 向けビルドでは tsup の設定で wasm-source.node.ts に差し替わる。
 */
// @ts-expect-error - Vite ?url import
import wasmUrl from '../wasm/basis_encoder.wasm?url'

/** Emscripten モジュールの初期化引数を返す */
export async function getBasisModuleArg(): Promise<Record<string, unknown>> {
  return { locateFile: () => wasmUrl as string }
}
