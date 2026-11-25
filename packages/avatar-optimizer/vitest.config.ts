import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import type { Plugin } from 'vitest/config'
import { defineConfig } from 'vitest/config'

const basisDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'node_modules/three/examples/jsm/libs/basis',
)

/**
 * ブラウザテストが CDN に依存せずローカルの basis_transcoder.{js,wasm} を
 * `/basis/` から読み込めるようにする Vite プラグイン
 */
function serveLocalBasisPlugin(): Plugin {
  return {
    name: 'serve-local-basis',
    configureServer(server) {
      server.middlewares.use('/basis', (req, res, next) => {
        const cleanUrl = (req.url ?? '').split('?')[0].replace(/^\/+/, '')
        if (
          cleanUrl !== 'basis_transcoder.js' &&
          cleanUrl !== 'basis_transcoder.wasm'
        ) {
          next()
          return
        }

        const filePath = path.join(basisDir, cleanUrl)
        if (!fs.existsSync(filePath)) {
          next()
          return
        }

        res.setHeader(
          'Content-Type',
          cleanUrl.endsWith('.wasm')
            ? 'application/wasm'
            : 'application/javascript; charset=utf-8',
        )
        fs.createReadStream(filePath).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [serveLocalBasisPlugin()],
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
