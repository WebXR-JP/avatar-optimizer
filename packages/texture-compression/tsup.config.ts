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
  // WASMモジュールは動的インポートで読み込むため外部モジュールとして扱う
  external: [/\.wasm$/, /wasm\/basis_encoder/],
})
