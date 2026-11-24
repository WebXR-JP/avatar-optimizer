import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'
import fs from 'fs'
import type { Plugin } from 'vite'

/**
 * 開発時のみ、ブラウザの PerfProbe から送られた計測結果を JSON Lines で保存する
 * （手元で操作できないブラウザの描画性能を調べるため）
 */
function perfLogPlugin(): Plugin
{
  const logFile = path.resolve(__dirname, 'node_modules/.cache/perf-log.jsonl')
  return {
    name: 'debug-viewer-perf-log',
    apply: 'serve',
    configureServer(server)
    {
      server.middlewares.use('/__perf-log', (req, res) =>
      {
        if (req.method !== 'POST')
        {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () =>
        {
          fs.mkdirSync(path.dirname(logFile), { recursive: true })
          fs.appendFileSync(logFile, body.replace(/\n/g, ' ') + '\n')
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

// GitHub Pages のプロジェクトページ (https://<org>.github.io/<repo>/) は
// リポジトリ名のサブパスで配信される。CI ではリポジトリ名を base にして、
// ローカル開発では '/' のまま動かす。独自ドメインなどで配信する場合は
// PAGES_BASE で明示的に上書きする（例: PAGES_BASE=/ pnpm build）。
const base = process.env.PAGES_BASE
  ?? (process.env.GITHUB_ACTIONS
    ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'avatar-optimizer'}/`
    : '/')

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    perfLogPlugin(),
  ],
  resolve: {
    alias: {
      // monorepo 開発中だけ src を直参照
      '@webxr-jp/avatar-optimizer': path.resolve(__dirname, '../avatar-optimizer/src'),
      '@webxr-jp/mtoon-atlas': path.resolve(__dirname, '../mtoon-atlas/src'),
    },
  },
  server: {
    host: true, // コンテナ外からのアクセスを許可
    allowedHosts: ['.tail54a7c.ts.net'], // Tailscale Serve 経由の MagicDNS 名を許可
    fs: {
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, '..'), // 親ディレクトリを許可
      ],
    },
    port: 5173,
  },
})
