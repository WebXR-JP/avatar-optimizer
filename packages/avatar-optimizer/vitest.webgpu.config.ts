/**
 * ネイティブ WebGPU（非フォールバック）専用の Vitest 設定
 *
 * 通常の vitest.config.ts は SwiftShader + ANGLE（WebGL2）固定で CI 互換性を優先している。
 * 本設定では Chromium でネイティブ WebGPU（macOS Metal 等）を有効にし、
 * `VITE_WEBGPU_NATIVE=true` で WebGPUBackend が実際に使われていることを厳密に検証する。
 */
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
  publicDir: 'tests/fixtures',
  define: {
    'import.meta.env.VITE_WEBGPU_NATIVE': JSON.stringify('true'),
  },
  test: {
    include: [
      'tests/browser/MToonAtlasNodeMaterialWebGPU.test.ts',
      'tests/browser/OptimizeModelKtx2.test.ts',
    ],
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
