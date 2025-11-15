import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'dom',
    testTimeout: 30_000,
    pool: 'vmThreads',
    coverage: { enabled: true },
  },
})
