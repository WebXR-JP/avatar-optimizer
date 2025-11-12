import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build
  {
    name: 'library',
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true, // Re-enable DTS generation
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    treeshake: true,
    outDir: 'dist',
    external: ['canvas'],
  },
  // CLI build
  {
    name: 'cli',
    entry: ['src/cli/index.ts'],
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    minify: false,
    treeshake: true,
    outDir: 'dist',
    outExtension: () => ({ js: '.mjs' }),
    external: ['canvas'],
  },
])
