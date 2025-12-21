import { playwright } from '@vitest/browser-playwright'
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // wasmディレクトリを静的ファイルとして提供
  publicDir: resolve(__dirname, 'wasm'),
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
    },
    // ブラウザ環境でテスト実行（WASM互換性のため）
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
