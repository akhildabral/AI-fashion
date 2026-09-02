import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initTheme } from './lib/theme'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root element #root not found')
}

initTheme()

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: register the (network-only) service worker so the app is installable.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Install prompt just won't appear — the app still works.
    })
  })
}
