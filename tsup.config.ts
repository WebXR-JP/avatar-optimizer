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
    external: ['canvas'],
  },
  // CLI build
  {
    name: 'cli',
    entry: ['src/cli.ts'],
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    minify: false,
    treeshake: true,
    outDir: 'dist',
    outExtension: () => ({ js: '.cjs' }),
    external: ['canvas'],
  },
])
