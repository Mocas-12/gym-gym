import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initInstallCapture } from './lib/pwa.js'
import './index.css'

initInstallCapture()
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}))
}
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
