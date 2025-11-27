import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', '__tests__/**/*.test.ts'],
    environment: 'happy-dom',
    testTimeout: 30_000,
    // pool: 'vmThreads', // pool option is not needed for browser mode or can be conflicting
    coverage: { enabled: true },
    browser: {
      enabled: true,
      provider: 'webdriverio',
      name: 'chrome',
      headless: true,
    },
  },
})
