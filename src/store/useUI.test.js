import { beforeEach, afterEach, expect, it, vi } from 'vitest'

vi.mock('./useStore.js', () => ({
  useStore: { getState: () => ({ sync: { url: 'https://test.invalid', token: 't' }, settings: {} }) },
}))
vi.mock('../lib/sync.js', () => ({ restPush: vi.fn(), restPushCancel: vi.fn() }))
const storage = new Map()
vi.stubGlobal('localStorage', {
  getItem: key => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
})
const { usePersistence } = await import('./persistence.js')
usePersistence.setState({ writable: true, ready: true })
const { useUI } = await import('./useUI.js')
const { restPush, restPushCancel } = await import('../lib/sync.js')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
  useUI.getState().stopRest()
  vi.mocked(restPush).mockReset()
  vi.mocked(restPushCancel).mockReset()
})
afterEach(() => vi.useRealTimers())

it('+30s 取消旧任务，并按照新截止时间调度', async () => {
  vi.mocked(restPush).mockResolvedValueOnce({ id: 'old' }).mockResolvedValueOnce({ id: 'new' })
  useUI.getState().startRest(90, '卧推')
  await Promise.resolve()
  useUI.getState().addRest(30)
  await Promise.resolve()
  expect(restPushCancel).toHaveBeenCalledWith('https://test.invalid', 't', 'old')
  expect(restPush).toHaveBeenLastCalledWith('https://test.invalid', 't', 120, '卧推')
  expect(useUI.getState().restUntil).toBe(121000)
})

it('点击跳过后才到达的任务 id 也会取消', async () => {
  let finish
  vi.mocked(restPush).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      })
  )
  useUI.getState().startRest(90)
  useUI.getState().stopRest()
  finish({ id: 'late' })
  await Promise.resolve()
  expect(restPushCancel).toHaveBeenCalledWith('https://test.invalid', 't', 'late')
  expect(useUI.getState().restPushId).toBeNull()
})

it('重新加载模块后恢复原截止时间，跳过后清除持久化计时', async () => {
  vi.mocked(restPush).mockResolvedValueOnce({ id: 'durable' })
  useUI.getState().startRest(90, '卧推')
  await Promise.resolve()
  vi.resetModules()
  const { usePersistence: reloadedPersistence } = await import('./persistence.js')
  reloadedPersistence.setState({ writable: true, ready: true })
  const { useUI: reloaded } = await import('./useUI.js')
  expect(reloaded.getState()).toMatchObject({ restUntil: 91000, restLabel: '卧推', restPushId: 'durable' })
  reloaded.getState().stopRest()
  expect(JSON.parse(storage.get('gym-gym-rest')).restUntil).toBe(0)
})
