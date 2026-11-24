// 他のモジュールより先に評価させるため、最初に import する
import './ktx2-config'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StressViewer } from './components/StressViewer.tsx'
import { isStressRoute } from './stress-route.ts'

import { BrowserRouter } from 'react-router-dom'

// GitHub Pages のプロジェクトページ (/<repo>/) 配信に対応するため、
// ルーターの basename を Vite の base から決める（末尾スラッシュは不要）
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

// ストレステスト（/stress）は通常ビューアとは独立したページとして描画する。
// StrictMode の二重マウントで VRM を 2 倍読み込んでしまうため、このページだけ
// StrictMode の外に置く（計測条件を一定に保つため）。
createRoot(document.getElementById('root')!).render(
  isStressRoute(window.location.pathname, import.meta.env.BASE_URL)
    ? <StressViewer />
    : (
      <StrictMode>
        <BrowserRouter basename={routerBasename}>
          <App />
        </BrowserRouter>
      </StrictMode>
    ),
)
