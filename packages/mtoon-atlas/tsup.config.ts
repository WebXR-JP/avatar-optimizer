import { defineConfig } from 'tsup'
import { raw } from "esbuild-raw-plugin";

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // WebGPURenderer 向け（three/webgpu に依存するため別エントリ）
    'nodes/index': 'src/nodes/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
  outDir: 'dist',
  esbuildPlugins: [raw()],
  external: ['three', 'three/webgpu', 'three/tsl', '@pixiv/three-vrm', '@pixiv/three-vrm-materials-mtoon']
})
