import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],
  resolve: {
    alias: {
      // monorepo 開発中だけ src を直参照
      '@xrift/avatar-optimizer': path.resolve(__dirname, '../avatar-optimizer/src'),
      '@xrift/mtoon-atlas': path.resolve(__dirname, '../mtoon-atlas/src'),
    },
  },
  server: {
    fs: {
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, '..'), // 親ディレクトリを許可
      ],
    },
  },
})
