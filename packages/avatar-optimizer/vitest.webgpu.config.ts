/**
 * ネイティブ WebGPU（非フォールバック）専用の Vitest 設定
 *
 * 通常の vitest.config.ts は SwiftShader + ANGLE（WebGL2）固定で CI 互換性を優先している。
 * 本設定では Chromium でネイティブ WebGPU（macOS Metal 等）を有効にし、
 * `VITE_WEBGPU_NATIVE=true` で WebGPUBackend が実際に使われていることを厳密に検証する。
 */
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  publicDir: 'tests/fixtures',
  define: {
    'import.meta.env.VITE_WEBGPU_NATIVE': JSON.stringify('true'),
  },
  test: {
    include: ['tests/browser/MToonAtlasNodeMaterialWebGPU.test.ts'],
    testTimeout: 30_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
            '--disable-dev-shm-usage',
          ],
        },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
})
