import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build
  {
    name: 'library',
    // index: ブラウザ / Node 共通の本体、node: Node 用のポリフィルと WebGPU レンダラー生成
    entry: { index: 'src/index.ts', node: 'src/node/index.ts' },
    format: ['esm'],
    dts: {
      resolve: true,
      compilerOptions: {
        skipLibCheck: true,
      },
    },
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    treeshake: true,
    outDir: 'dist',
    external: [
      'three',
      'three/webgpu',
      '@pixiv/three-vrm',
      '@pixiv/three-vrm-materials-mtoon',
    ],
  },
])
