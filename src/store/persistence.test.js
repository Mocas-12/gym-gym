import { beforeEach, expect, it, vi } from 'vitest'
import { assertWritable, durableStorage, retrySave, usePersistence, startPersistence } from './persistence.js'
const memory = new Map(),
  KEY = 'gym_gym_v1'
const setItem = vi.fn((key, value) => memory.set(key, value))
vi.stubGlobal('localStorage', {
  getItem: key => memory.get(key) || null,
  setItem,
  removeItem: key => memory.delete(key),
})
beforeEach(() => {
  memory.clear()
  setItem.mockClear()
  durableStorage.getItem(KEY)
  usePersistence.setState({
    writable: true,
    ready: true,
    error: '',
    pending: null,
    conflict: false,
    loadError: '',
  })
})

it('保存失败保留最新待保存内容，重试成功后清除提示', () => {
  durableStorage.setItem(KEY, { state: { weight: 73 }, version: 5 })
  setItem.mockImplementationOnce(() => {
    throw new Error('QuotaExceededError')
  })
  durableStorage.setItem(KEY, { state: { weight: 74 }, version: 5 })
  expect(JSON.parse(memory.get(KEY)).state.weight).toBe(73)
  expect(JSON.parse(usePersistence.getState().pending).state.weight).toBe(74)
  expect(usePersistence.getState().error).toContain('保存失败')
  retrySave()
  expect(JSON.parse(memory.get(KEY)).state.weight).toBe(74)
  expect(usePersistence.getState()).toMatchObject({ error: '', pending: null })
})

it('等待写锁的页面不能写入', () => {
  usePersistence.setState({ writable: false })
  expect(assertWritable).toThrow('编辑权限')
  expect(() => durableStorage.setItem(KEY, { state: {} })).toThrow('编辑权限')
  expect(setItem).not.toHaveBeenCalled()
})

it('缺少写锁能力时停止编辑，不退回不安全写入', () => {
  vi.stubGlobal('navigator', {})
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })
  const load = vi.fn()
  const dispose = startPersistence(load, vi.fn())
  expect(load).not.toHaveBeenCalled()
  expect(usePersistence.getState()).toMatchObject({ writable: false, ready: false })
  expect(usePersistence.getState().loadError).toContain('不支持')
  dispose()
})

it('等待期间或后台恢复后，旧草稿不能覆盖其他页面的新数据', () => {
  durableStorage.setItem(KEY, { state: { weight: 73 } })
  memory.set(KEY, JSON.stringify({ state: { weight: 75 } }))
  durableStorage.setItem(KEY, { state: { weight: 74 } })
  expect(usePersistence.getState().conflict).toBe(true)
  retrySave()
  expect(JSON.parse(memory.get(KEY)).state.weight).toBe(75)
  expect(JSON.parse(usePersistence.getState().pending).state.weight).toBe(74)
})

it('取得锁后才加载数据；离开页面释放锁，并在未保存时阻止无提示关闭', async () => {
  const listeners = {},
    rehydrate = vi.fn(),
    restoreRest = vi.fn()
  let enter, lockFinished
  vi.stubGlobal('window', {
    addEventListener: (name, fn) => {
      listeners[name] = fn
    },
    removeEventListener() {},
  })
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn((_key, fn) => {
        enter = () => (lockFinished = fn())
        return Promise.resolve()
      }),
    },
  })
  const dispose = startPersistence(rehydrate, restoreRest)
  expect(rehydrate).not.toHaveBeenCalled()
  expect(usePersistence.getState().ready).toBe(false)
  enter()
  await Promise.resolve()
  await Promise.resolve()
  expect(rehydrate).toHaveBeenCalledOnce()
  expect(restoreRest).toHaveBeenCalledOnce()
  expect(usePersistence.getState().ready).toBe(true)
  usePersistence.setState({ pending: '{}' })
  const event = { preventDefault: vi.fn() }
  listeners.beforeunload(event)
  expect(event.preventDefault).toHaveBeenCalledOnce()
  listeners.pagehide()
  await lockFinished
  expect(usePersistence.getState().writable).toBe(false)
  dispose()
})
