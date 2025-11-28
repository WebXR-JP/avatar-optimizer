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
      provider: 'istanbul', // webdriverioブラウザプロバイダと互換性を持たせるため
    },
    browser: {
      enabled: true,
      provider: 'webdriverio',
      name: 'chrome',
      headless: true,
    },
  },
})
