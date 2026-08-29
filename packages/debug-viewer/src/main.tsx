import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setKtx2TranscoderPath } from '@webxr-jp/mtoon-atlas'
import './index.css'
import App from './App.tsx'

// KTX2 トランスコーダを同一オリジンから配信する（public/basis/ に同梱）
// 既定は jsdelivr の CDN だが、外部依存を避けるため差し替えている
setKtx2TranscoderPath('/basis/')

import { BrowserRouter } from 'react-router-dom'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
