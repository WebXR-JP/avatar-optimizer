import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // monorepo 開発中だけ src を直参照
      '@xrift/avatar-optimizer': path.resolve(__dirname, '../avatar-optimizer/src'),
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
