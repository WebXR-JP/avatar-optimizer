/**
 * Node 環境専用の Vitest 設定
 *
 * `@webxr-jp/avatar-optimizer/node`（ポリフィルと WebGPU レンダラー生成）と、
 * Node 上での loadVRM → optimizeModel → exportVRM を検証する。
 * GPU アダプタ（Vulkan / Metal / D3D12、または lavapipe）が無い環境では
 * WebGPU を使うテストはスキップされる。
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/node/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
})
