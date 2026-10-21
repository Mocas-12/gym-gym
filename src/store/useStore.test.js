import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/sync.js', () => ({ pushData: vi.fn(), pullData: vi.fn() }))
const memory = new Map()
vi.stubGlobal('localStorage', {
  getItem: k => memory.get(k) ?? null,
  setItem: (k, v) => memory.set(k, v),
  removeItem: k => memory.delete(k),
})
vi.stubGlobal('document', { addEventListener() {} })
vi.stubGlobal('window', { localStorage: globalThis.localStorage })
const { useStore } = await import('./useStore.js')
const { pushData } = await import('../lib/sync.js')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-21T12:00:00'))
  memory.clear()
  useStore.getState().resetAll()
  useStore.getState().setSync({ url: '', token: '', rev: 0, lastSync: 0, conflict: null })
  vi.mocked(pushData).mockReset()
})
afterEach(() => vi.useRealTimers())

describe('训练与数据保护', () => {
  it('空训练不能归档，也不能清空进行中的训练', () => {
    useStore.getState().startWorkout('未完成', ['bench'])
    const active = useStore.getState().active
    expect(useStore.getState().finishWorkout()).toBeNull()
    expect(useStore.getState().active).toEqual(active)
    expect(useStore.getState().workouts).toEqual([])
  })
  it('删除、导入、清空前保留可恢复的数据', () => {
    const workout = { id: 'w', start: Date.now(), entries: [{ exId: 'bench', sets: [] }] }
    useStore.setState({ workouts: [workout] })
    useStore.getState().deleteWorkout('w')
    expect(useStore.getState().workouts).toEqual([])
    useStore.getState().restoreRecovery()
    expect(useStore.getState().workouts).toEqual([workout])
    const backup = useStore.getState().exportState()
    useStore.getState().importState(JSON.stringify({ app: 'gym-gym', workouts: [] }))
    expect(useStore.getState().workouts).toEqual([])
    useStore.getState().restoreRecovery()
    expect(useStore.getState().exportState()).toBe(backup)
  })
})

describe('同步时序', () => {
  const connect = () => useStore.getState().setSync({ url: 'https://test.invalid', token: 'token', rev: 0 })
  it('同步期间的修改仍保持待上传，下一次会传新数据', async () => {
    connect()
    let finish
    vi.mocked(pushData).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        })
    )
    const first = useStore.getState().syncNow()
    useStore.getState().logBodyweight(72)
    finish({ ok: true, data: { rev: 1 } })
    await first
    expect(useStore.getState().sync.dirty).toBe(true)
    vi.mocked(pushData).mockResolvedValueOnce({ ok: true, data: { rev: 2 } })
    await useStore.getState().syncNow()
    expect(pushData.mock.calls[1][3].bodyweight[0].kg).toBe(72)
    expect(useStore.getState().sync.dirty).toBe(false)
  })
  it('两个入口同时同步只发一个请求', async () => {
    connect()
    let finish
    vi.mocked(pushData).mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve
        })
    )
    const a = useStore.getState().syncNow()
    const b = useStore.getState().syncNow()
    expect(pushData).toHaveBeenCalledTimes(1)
    finish({ ok: true, data: { rev: 1 } })
    await Promise.all([a, b])
  })
  it('双方改动产生冲突时保留两份，禁止自动覆盖', async () => {
    connect()
    useStore.getState().logBodyweight(72)
    vi.mocked(pushData).mockResolvedValue({
      ok: false,
      status: 409,
      data: { rev: 2, state: { workouts: [], bodyweight: [{ kg: 80 }] } },
    })
    expect(await useStore.getState().syncNow()).toBe('conflict')
    expect(useStore.getState().bodyweight[0].kg).toBe(72)
    expect(useStore.getState().sync.conflict.rev).toBe(2)
    expect(pushData).toHaveBeenCalledTimes(1)
  })
  it('断开连接后，旧响应不能重新写入连接或覆盖数据', async () => {
    connect()
    let finish
    vi.mocked(pushData).mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve
        })
    )
    const pending = useStore.getState().syncNow()
    useStore.getState().setSync({ url: '', token: '', rev: 0 })
    finish({ ok: true, data: { rev: 9 } })
    await pending
    expect(useStore.getState().sync.rev).toBe(0)
  })
  it('保留本机并上传时，把将被覆盖的云端保存为恢复点', async () => {
    connect()
    useStore.getState().setSync({ conflict: { rev: 3, state: { workouts: [], bodyweight: [{ kg: 80 }] } } })
    vi.mocked(pushData).mockResolvedValue({ ok: true, data: { rev: 4 } })
    await useStore.getState().resolveConflict('local')
    expect(JSON.parse(useStore.getState().recovery.json).bodyweight[0].kg).toBe(80)
  })
})
