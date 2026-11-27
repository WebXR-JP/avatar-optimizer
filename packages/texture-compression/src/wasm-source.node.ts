/**
 * Basis エンコーダー WASM の読み込み元（Node 向け）
 *
 * Emscripten のローダーはブラウザ専用ビルドで fetch しか使えないため、
 * WASM をファイルから読み、wasmBinary として直接渡す。
 * ビルド後は dist/index.node.js から見た ../wasm/basis_encoder.wasm を読む。
 */
export async function getBasisModuleArg(): Promise<Record<string, unknown>> {
  const { readFile } = await import('node:fs/promises')
  const wasmBinary = await readFile(
    new URL('../wasm/basis_encoder.wasm', import.meta.url),
  )
  return { wasmBinary }
}
