import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initInstallCapture } from './lib/pwa.js'
import { initTelemetry, reportSw } from './lib/telemetry.js'
import './index.css'

initInstallCapture()
initTelemetry()
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {})
    // SW 状态自报：注册前后各报一次（首访 swActive:false 是排查「SW 未注册」的关键信号），
    // 之后每次控制器变更（新 SW 接管）也报
    reportSw()
    setTimeout(reportSw, 5000)
    navigator.serviceWorker.addEventListener('controllerchange', () => reportSw())
  })
}
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
