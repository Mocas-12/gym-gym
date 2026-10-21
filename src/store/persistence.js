import { create } from 'zustand'
import { deleteRecovery } from '../lib/recovery.js'

export const usePersistence = create(() => ({
  writable: false,
  ready: false,
  epoch: 0,
  loadError: '',
  error: '',
  pending: null,
  conflict: false,
}))
let savedRaw = null
const KEY = 'gym_gym_v1'

export function assertWritable() {
  if (!usePersistence.getState().writable) throw new Error('当前页面尚未取得编辑权限')
}

export const durableStorage = {
  getItem(name) {
    savedRaw = localStorage.getItem(name)
    return savedRaw ? JSON.parse(savedRaw) : null
  },
  setItem(name, value) {
    assertWritable()
    const raw = JSON.stringify(value)
    try {
      if (localStorage.getItem(name) !== savedRaw) {
        usePersistence.setState({ conflict: true })
        throw new Error('其他页面的数据已更新，请先导出未保存内容，再重新加载')
      }
      localStorage.setItem(name, raw)
      const previous = savedRaw && JSON.parse(savedRaw).state?.recovery
      const current = value.state?.recovery
      if (previous && current?.id && previous.id !== current.id)
        deleteRecovery(previous.id || 'latest').catch(() => {})
      savedRaw = raw
      usePersistence.setState({ error: '', pending: null, conflict: false })
    } catch (err) {
      usePersistence.setState({
        pending: raw,
        error: usePersistence.getState().conflict
          ? err.message
          : '保存失败，改动仅保留在当前页面。请重试或导出备份，暂勿关闭页面。',
      })
    }
  },
  removeItem(name) {
    assertWritable()
    localStorage.removeItem(name)
    savedRaw = null
  },
}

export function retrySave() {
  const { pending } = usePersistence.getState()
  if (pending) durableStorage.setItem(KEY, JSON.parse(pending))
}

// 一个页面持有写锁。后开的页面等锁释放后，先读取最新数据再显示编辑界面。
export function startPersistence(rehydrate, restoreRest) {
  let generation = 0,
    release
  const acquire = () => {
    const epoch = ++generation
    usePersistence.setState({ writable: false, ready: false, epoch })
    if (!navigator.locks) {
      usePersistence.setState({ loadError: '此浏览器不支持安全的多页面编辑，请使用新版浏览器。' })
      return
    }
    navigator.locks
      .request('gym-gym-writer', async () => {
        if (epoch !== generation) return
        usePersistence.setState({ writable: true, loadError: '', epoch })
        // 从后台恢复时保留未保存草稿，重试时会检查磁盘是否已被其他页面更新。
        if (!usePersistence.getState().pending) await rehydrate()
        if (epoch !== generation) return
        if (!usePersistence.getState().loadError) {
          restoreRest()
          usePersistence.setState({ ready: true })
        }
        await new Promise(resolve => {
          release = resolve
        })
      })
      .catch(() =>
        usePersistence.setState({
          writable: false,
          ready: false,
          loadError: '无法取得编辑权限，请重新加载。',
        })
      )
  }
  const hide = () => {
    generation++
    usePersistence.setState({ writable: false, ready: false, epoch: generation })
    release?.()
  }
  const show = event => {
    if (event.persisted) acquire()
  }
  const warn = event => {
    if (!usePersistence.getState().pending) return
    event.preventDefault()
    event.returnValue = ''
  }
  window.addEventListener('pagehide', hide)
  window.addEventListener('pageshow', show)
  window.addEventListener('beforeunload', warn)
  acquire()
  return () => {
    hide()
    window.removeEventListener('pagehide', hide)
    window.removeEventListener('pageshow', show)
    window.removeEventListener('beforeunload', warn)
  }
}
