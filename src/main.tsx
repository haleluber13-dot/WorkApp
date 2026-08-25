import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/theme.css'
import './styles/app.css'
import './styles/charts.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support: register the service worker once the page has settled.
// Single-file builds set __OMBAK_NO_SW__, since they ship without a sw.js to fetch.
declare global {
  interface Window { __OMBAK_NO_SW__?: boolean; Capacitor?: unknown }
}

const inNativeShell = typeof window.Capacitor !== 'undefined'

if (!window.__OMBAK_NO_SW__ && !inNativeShell && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline caching is a bonus; the app works fine without it.
    })
  })
}
