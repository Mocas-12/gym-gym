/* PWA 安装能力探测。
 * Android/桌面 Chrome 有 beforeinstallprompt 原生安装框；
 * iOS Safari 没有这个 API，只能引导用户走「分享 → 添加到主屏幕」；
 * 已在主屏幕独立模式下运行时（display-mode: standalone / navigator.standalone）整个安装入口都该藏起来。 */

let deferredPrompt = null
const listeners = new Set()
const notify = () => listeners.forEach(fn => fn(deferredPrompt != null))

export function initInstallCapture() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    deferredPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export const hasInstallPrompt = () => deferredPrompt != null
export const onInstallAvailability = fn => { listeners.add(fn); return () => listeners.delete(fn) }

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable'
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  notify()
  return outcome // 'accepted' | 'dismissed'
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS 桌面 UA
