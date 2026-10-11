/* 短暂 UI 状态：休息倒计时、toast。不持久化。 */
import { create } from 'zustand'

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
  } catch { /* 无声环境（未交互过等） */ }
}

export const useUI = create((set, get) => ({
  restUntil: 0,
  restLabel: '',
  toastMsg: '',
  startRest(sec, label = '') {
    set({ restUntil: Date.now() + sec * 1000, restLabel: label })
  },
  addRest(sec) { set({ restUntil: Math.max(get().restUntil, Date.now()) + sec * 1000 }) },
  stopRest() { set({ restUntil: 0, restLabel: '' }) },
  finishRest() {
    const { settings } = useStore.getState()
    if (settings.vibrate && navigator.vibrate) navigator.vibrate([180, 90, 180, 90, 320])
    if (settings.sound) beep(3)
    set({ restUntil: 0, restLabel: '' })
  },
  toast(msg) {
    set({ toastMsg: msg })
    clearTimeout(useUI._tm)
    useUI._tm = setTimeout(() => set({ toastMsg: '' }), 2600)
  },
}))
