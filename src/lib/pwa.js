/* PWA 安装能力探测。
 * Android/桌面 Chrome 有 beforeinstallprompt 原生安装框；
 * iOS Safari 没有这个 API，只能引导用户走「分享 → 添加到主屏幕」；
 * 已在主屏幕独立模式下运行时（display-mode: standalone / navigator.standalone）整个安装入口都该藏起来。 */
// @ts-check

/**
 * Chrome 私有的安装事件（lib.dom 没有类型）
 * @typedef {{ prompt(): Promise<void>, userChoice: Promise<{ outcome: 'accepted'|'dismissed' }> }} InstallPromptEvent
 */

/** @type {InstallPromptEvent|null} */
let deferredPrompt = null
/** @type {Set<(available: boolean) => void>} */
const listeners = new Set()
const notify = () => listeners.forEach(fn => fn(deferredPrompt != null))

/** 监听安装相关事件（在 app 入口调用一次）@returns {void} */
export function initInstallCapture() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    deferredPrompt = /** @type {InstallPromptEvent} */ (/** @type {unknown} */ (e))
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

/** @returns {boolean} */
export const hasInstallPrompt = () => deferredPrompt != null

/**
 * 订阅「可安装」状态变化，返回退订函数。
 * @param {(available: boolean) => void} fn
 * @returns {() => void}
 */
export const onInstallAvailability = fn => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** @returns {Promise<'accepted'|'dismissed'|'unavailable'>} */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable'
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  notify()
  return outcome
}

/** 是否已在主屏幕独立模式（iOS 用 navigator.standalone 判断）@returns {boolean} */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  /** @type {any} */ (window.navigator).standalone === true

/** @returns {boolean} */
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS 桌面 UA
