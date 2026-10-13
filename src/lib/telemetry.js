/* 诊断遥测：客户端错误捕获 + SW/缓存状态自报。
 * 边界：只在用户已连接自己的微后端时上报（数据不出自己的账号，见 docs/SYNC_PUSH.md）；
 * 上报内容=错误消息/栈、app 版本、UA、SW 与缓存状态——不含任何训练数据。
 * 全部 fire-and-forget：上报失败静默，绝不影响主流程。 */
// @ts-check
/* global __APP_VERSION__ */
import { useStore } from '../store/useStore.js'
import { reportError, reportSwStatus } from './sync.js'

/** @type {string} 构建时由 vite define 注入 package.json 版本 */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

/** @type {Set<string>} 同一错误指纹一次会话只报一次（崩溃往往连发几十条同一栈） */
const sent = new Set()
let sentCount = 0
const MAX_PER_SESSION = 10

/** 设备标识：随机生成、只存本机，用于服务端区分「同一台设备的多次上报」 */
const deviceId = () => {
  try {
    let d = localStorage.getItem('gg_dev')
    if (!d) {
      d = [...crypto.getRandomValues(new Uint8Array(8))].map(x => x.toString(16).padStart(2, '0')).join('')
      localStorage.setItem('gg_dev', d)
    }
    return d
  } catch {
    return 'unknown'
  }
}

/** 已配置同步才上报 @returns {{ url: string, token: string }|null} */
const syncCfg = () => {
  const { sync } = useStore.getState()
  return sync?.url && sync?.token ? sync : null
}

/**
 * 上报一条错误（window.onerror / unhandledrejection / ErrorBoundary 共用入口）。
 * @param {unknown} err
 * @param {string} kind 'window' | 'promise' | 'render'
 * @returns {void}
 */
export function reportErr(err, kind) {
  const sync = syncCfg()
  if (!sync || sentCount >= MAX_PER_SESSION) return
  const raw = String(/** @type {any} */ (err)?.message || err || 'unknown').slice(0, 500)
  const fp = kind + ':' + raw
  if (sent.has(fp)) return
  sent.add(fp)
  sentCount++
  reportError(sync.url, sync.token, {
    v: APP_VERSION,
    msg: kind + ': ' + raw,
    stack:
      typeof (/** @type {any} */ (err)?.stack) === 'string'
        ? /** @type {any} */ (err).stack.slice(0, 1500)
        : undefined,
    url: location.href.slice(0, 200),
    ua: navigator.userAgent.slice(0, 200),
  })
}

/**
 * SW/缓存状态自报：首访（SW 尚未注册）也照报——「swActive:false + precache:missing」
 * 正是排查「SW 从未注册/离线白屏」类灾难的关键信号。
 * @returns {Promise<void>}
 */
export async function reportSw() {
  const sync = syncCfg()
  if (!sync) return
  try {
    const regs = /** @type {any} */ (navigator.serviceWorker)?.getRegistrations?.() || []
    /** @type {any[]} */
    const list = await regs
    const swActive = list.some(r => r.active)
    // SW 代码版本：从脚本源码里抠缓存名（gym-gym-v2），服务端能看到每台设备跑的是哪版 SW
    let swV
    try {
      const src = await fetch('sw.js', { cache: 'no-store' }).then(r => r.text())
      swV = (src.match(/const CACHE = '([^']+)'/) || [])[1]
    } catch {
      /* 离线且未缓存 sw.js 本体时拿不到，可接受 */
    }
    const cacheNames = 'caches' in window ? await caches.keys() : []
    // 预缓存自检：读 sw.js install 时写入的调试记录（每个资产的 fetch 状态码）
    let precache = cacheNames.length ? 'partial' : 'missing'
    for (const name of cacheNames) {
      const c = await caches.open(name)
      const dbg = await c.match('__install_debug__')
      if (!dbg) continue
      const detail = await dbg.json().catch(() => null)
      if (detail && !detail.fatal && Object.values(detail).every(v => v === 200)) precache = 'ok'
      break
    }
    reportSwStatus(sync.url, sync.token, {
      v: APP_VERSION,
      dev: deviceId(),
      swActive,
      swV,
      cacheNames,
      precache,
      ua: navigator.userAgent.slice(0, 200),
    })
  } catch {
    /* 诊断永不抛错 */
  }
}

/** 在 app 入口调用一次：挂全局错误钩子 */
export function initTelemetry() {
  window.addEventListener('error', e => reportErr(e.error || e.message, 'window'))
  window.addEventListener('unhandledrejection', e => reportErr(/** @type {any} */ (e).reason, 'promise'))
}
