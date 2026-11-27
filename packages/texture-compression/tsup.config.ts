import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsup'

const srcDir = path.dirname(fileURLToPath(import.meta.url)) + '/src'

// WASMモジュールは動的インポートで読み込むため外部モジュールとして扱う
const external = [/\.wasm$/, /wasm\/basis_encoder/]

export default defineConfig([
  // ブラウザ / バンドラー向け（Vite の ?url で WASM の URL を解決する）
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    // 並列に走る Node 向けビルドの出力は消さない
    clean: ['!index.node.js', '!index.node.js.map'],
    splitting: false,
    shims: true,
    outDir: 'dist',
    external,
  },
  // Node 向け（package.json の "node" 条件で選ばれる）。
  // wasm-source を Node 版に差し替え、WASM をファイルから読む
  {
    entry: { 'index.node': 'src/index.ts' },
    format: ['esm'],
    platform: 'node',
    dts: false,
    sourcemap: true,
    clean: false,
    splitting: false,
    outDir: 'dist',
    external,
    esbuildPlugins: [
      {
        name: 'node-wasm-source',
        setup(build) {
          build.onResolve({ filter: /^\.\/wasm-source$/ }, () => ({
            path: path.join(srcDir, 'wasm-source.node.ts'),
          }))
        },
      },
    ],
  },
])
