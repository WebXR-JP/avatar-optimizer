import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build
  {
    name: 'library',
    entry: ['src/index.ts'],
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
  },
])
