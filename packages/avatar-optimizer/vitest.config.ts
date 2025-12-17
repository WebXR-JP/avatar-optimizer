import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // テスト用fixturesディレクトリを配信するための設定
  publicDir: 'tests/fixtures',
  test: {
    include: ['tests/**/*.test.ts', '__tests__/**/*.test.ts'],
    environment: 'happy-dom',
    testTimeout: 30_000,
    coverage: {
      enabled: true,
      provider: 'istanbul',
    },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--disable-gpu-sandbox',
            '--no-sandbox',
            '--disable-dev-shm-usage',
          ],
        },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
})
