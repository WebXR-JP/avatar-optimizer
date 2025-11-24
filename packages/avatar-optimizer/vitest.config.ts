import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', '__tests__/**/*.test.ts'],
    environment: 'happy-dom',
    testTimeout: 30_000,
    pool: 'vmThreads',
    coverage: { enabled: true },
  },
})
