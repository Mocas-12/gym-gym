/* 休息截止时间持久化，toast 只保留在当前页面。 */
import { create } from 'zustand'
import { useStore } from './useStore.js'
import { restPush, restPushCancel } from '../lib/sync.js'

let savedRest = {}
try {
  const value = JSON.parse(localStorage.getItem('gym-gym-rest') || '{}')
  if (value && typeof value === 'object') savedRest = value
} catch {}
let audioCtx = null
function beep(times = 3) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator()
      const g = audioCtx.createGain()
      o.frequency.value = 880
      o.type = 'sine'
      g.gain.setValueAtTime(0.001, audioCtx.currentTime + i * 0.45)
      g.gain.exponentialRampToValueAtTime(0.35, audioCtx.currentTime + i * 0.45 + 0.03)
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.45 + 0.35)
      o.connect(g).connect(audioCtx.destination)
      o.start(audioCtx.currentTime + i * 0.45)
      o.stop(audioCtx.currentTime + i * 0.45 + 0.4)
    }
  } catch {
    /* 无声环境（未交互过等） */
  }
}

export const useUI = create((set, get) => ({
  restUntil: Number.isFinite(savedRest.restUntil) ? savedRest.restUntil : 0,
  restLabel: typeof savedRest.restLabel === 'string' ? savedRest.restLabel : '',
  toastMsg: '',
  restPushId: savedRest.restPushId || null,
  restGeneration: 0,
  startRest(sec, label = '') {
    get().stopRest()
    const generation = get().restGeneration
    set({ restUntil: Date.now() + sec * 1000, restLabel: label })
    // 已配置云同步 → 服务器定时推送（手表随 iPhone 镜像），页面被冻结也能收到
    const { sync } = useStore.getState()
    if (sync.url && sync.token && sec >= 30) {
      restPush(sync.url, sync.token, sec, label).then(r => {
        if (!r?.id) return
        if (get().restGeneration !== generation) restPushCancel(sync.url, sync.token, r.id)
        else set({ restPushId: r.id })
      })
    }
  },
  addRest(sec) {
    const until = Math.max(get().restUntil, Date.now()) + sec * 1000
    get().startRest(Math.ceil((until - Date.now()) / 1000), get().restLabel)
  },
  stopRest() {
    const { sync } = useStore.getState()
    const { restPushId } = get()
    if (restPushId) restPushCancel(sync.url, sync.token, restPushId)
    set({ restUntil: 0, restLabel: '', restPushId: null, restGeneration: get().restGeneration + 1 })
  },
  finishRest() {
    const { settings } = useStore.getState()
    if (settings.vibrate && navigator.vibrate) navigator.vibrate([180, 90, 180, 90, 320])
    if (settings.sound) beep(3)
    get().stopRest()
  },
  toast(msg) {
    set({ toastMsg: msg })
    clearTimeout(useUI._tm)
    useUI._tm = setTimeout(() => set({ toastMsg: '' }), 2600)
  },
}))

useUI.subscribe((state, prev) => {
  if (state.restUntil === prev.restUntil && state.restPushId === prev.restPushId) return
  try {
    localStorage.setItem(
      'gym-gym-rest',
      JSON.stringify({ restUntil: state.restUntil, restLabel: state.restLabel, restPushId: state.restPushId })
    )
  } catch {
    /* 计时仍在当前页面继续 */
  }
})
// 只有确实接管了这个计时的可见页面才允许 SW 静默通知。
if (typeof navigator !== 'undefined')
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type !== 'rest-notification') return
    const state = useUI.getState()
    const handled =
      document.visibilityState === 'visible' && state.restUntil > 0 && state.restPushId === event.data.restId
    if (handled) {
      state.finishRest()
      state.toast('休息结束，准备下一组')
    }
    event.ports?.[0]?.postMessage({ handled })
  })
