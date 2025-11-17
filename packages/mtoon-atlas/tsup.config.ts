import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
  outDir: 'dist',
  esbuildOptions(options) {
    // シェーダーファイルをテキストアセットとして処理
    options.loader = {
      ...options.loader,
      '.vert': 'text',
      '.frag': 'text',
    }
  },
})
