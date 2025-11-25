import { defineConfig } from 'tsup'
import { raw } from "esbuild-raw-plugin";

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
  outDir: 'dist',
  esbuildPlugins: [raw()],
  external: ['three', '@pixiv/three-vrm', '@pixiv/three-vrm-materials-mtoon']
})
