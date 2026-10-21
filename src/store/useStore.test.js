import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../lib/sync.js', () => ({ pushData: vi.fn(), pullData: vi.fn() }))
const backup = vi.hoisted(() => ({ value: null }))
vi.mock('../lib/recovery.js', () => ({
  writeRecovery: vi.fn(async value => {
    backup.value = value
  }),
  readRecovery: vi.fn(async () => backup.value),
}))
const memory = new Map()
vi.stubGlobal('localStorage', {
  getItem: k => memory.get(k) ?? null,
  setItem: (k, v) => memory.set(k, v),
  removeItem: k => memory.delete(k),
})
vi.stubGlobal('document', { addEventListener() {} })
vi.stubGlobal('window', { localStorage: globalThis.localStorage })
const { useStore } = await import('./useStore.js')
const { pushData, pullData } = await import('../lib/sync.js')
const { writeRecovery } = await import('../lib/recovery.js')
const { fingerprints, DATA_KEYS } = await import('../lib/merge.js')
const state = () => useStore.getState()
const document = () => Object.fromEntries(DATA_KEYS.map(k => [k, state()[k]]))
const connect = () => state().setSync({ url: 'https://test.invalid', token: 'token', rev: 0 })
const workout = (id, start, kg = 60) => ({
  id,
  start,
  entries: [{ exId: 'bench', sets: [{ kg, reps: 8, done: true }] }],
})
let cloud = null,
  rev = 0
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T12:00:00'))
  vi.mocked(writeRecovery).mockClear()
  state().setSync({ url: '', token: '', rev: 0, lastSync: 0, conflict: null, base: null })
  await state().resetAll()
  memory.clear()
  backup.value = null
  cloud = null
  rev = 0
  vi.mocked(pullData)
    .mockReset()
    .mockImplementation(async () => ({ ok: true, data: { rev, state: cloud } }))
  vi.mocked(pushData)
    .mockReset()
    .mockImplementation(async (_url, _token, _base, doc) => {
      cloud = structuredClone(doc)
      return { ok: true, data: { rev: ++rev } }
    })
})
afterEach(() => vi.useRealTimers())

describe('训练与数据保护', () => {
  it('空训练不归档；计时动作使用秒数目标', () => {
    state().startWorkout('未完成', ['bench'])
    const active = state().active
    expect(state().finishWorkout()).toBeNull()
    expect(state().active).toEqual(active)
    const ex = state()
      .allEx()
      .find(e => e.type === 'time')
    state().startWorkout('计时', [ex.id], state().routines[0].id)
    expect(state().active.entries[0].sets[0]).toMatchObject({ sec: 45, done: false })
    expect(state().active.entries[0].targetSec).toBe(45)
  })
  it('删除、导入、恢复可往返，localStorage 不包含恢复点正文', async () => {
    state().addWorkout(workout('w', 1))
    const original = state().exportState()
    await state().deleteWorkout('w')
    expect(state().workouts).toEqual([])
    expect(JSON.parse(memory.get('gym_gym_v1')).state.recovery.json).toBeUndefined()
    await state().restoreRecovery()
    expect(JSON.parse(state().exportState())).toEqual(JSON.parse(original))
    await state().importState(JSON.stringify({ app: 'gym-gym', workouts: [] }))
    expect(state().workouts).toEqual([])
    await state().restoreRecovery()
    expect(JSON.parse(state().exportState())).toEqual(JSON.parse(original))
  })
  it('恢复点失败时保留原数据', async () => {
    state().addWorkout(workout('w', 1))
    vi.mocked(writeRecovery).mockRejectedValueOnce(new Error('quota'))
    await expect(state().deleteWorkout('w')).rejects.toThrow('quota')
    expect(state().workouts).toHaveLength(1)
  })
  it('保存恢复点期间的新编辑不能被覆盖', async () => {
    const pending = state().importState(JSON.stringify({ app: 'gym-gym', workouts: [] }))
    state().logBodyweight(72)
    await expect(pending).rejects.toThrow('数据已变化')
    expect(state().bodyweight[0].kg).toBe(72)
  })
  it('旧版本内联恢复点仍能恢复', async () => {
    useStore.setState({
      recovery: { json: JSON.stringify({ app: 'gym-gym', bodyweight: [{ d: '2026-10-20', kg: 75 }] }) },
    })
    await state().restoreRecovery()
    expect(state().bodyweight[0].kg).toBe(75)
    expect(state().recovery.json).toBeUndefined()
  })
  it('修改、补记和删除都重算后续 PR', async () => {
    state().addWorkout(workout('late', 3, 80))
    state().addWorkout(workout('early', 1, 60))
    expect(state().workouts[0].prs).toHaveLength(1)
    await state().updateWorkout('early', { entries: workout('x', 1, 90).entries })
    expect(state().workouts[0].prs).toBeUndefined()
    await state().deleteWorkout('early')
    expect(state().workouts[0].prs).toBeUndefined()
  })
})

describe('记录级同步', () => {
  it('请求期间的新修改保持待传，下一次上传', async () => {
    connect()
    let finish
    vi.mocked(pushData).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        })
    )
    const pending = state().syncNow()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    state().logBodyweight(72)
    finish({ ok: true, data: { rev: 1 } })
    await pending
    expect(state().sync.dirty).toBe(true)
    await state().syncNow()
    expect(pushData.mock.calls[1][3].bodyweight[0].kg).toBe(72)
    expect(state().sync.dirty).toBe(false)
  })
  it('两个入口只产生一个请求，断开后响应失效', async () => {
    connect()
    let finish
    vi.mocked(pullData).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        })
    )
    const a = state().syncNow(),
      b = state().syncNow()
    expect(pullData).toHaveBeenCalledTimes(1)
    state().setSync({ url: '', token: '', rev: 0 })
    finish({ ok: true, data: { rev: 9, state: null } })
    await Promise.all([a, b])
    expect(state().sync.rev).toBe(0)
    expect(pushData).not.toHaveBeenCalled()
  })
  it('离线双方新增独立记录时自动合并', async () => {
    connect()
    await state().syncNow()
    cloud.bodyweight = [{ d: '2026-10-20', kg: 80 }]
    rev++
    state().logBodyweight(72)
    expect(await state().syncNow()).toBe('synced')
    expect(state().bodyweight).toHaveLength(2)
    expect(cloud.bodyweight).toHaveLength(2)
    expect(state().sync.conflict).toBeNull()
  })
  it('删除与远端新增各自保留，旧记录不会复活', async () => {
    connect()
    state().addWorkout(workout('old', 1))
    await state().syncNow()
    await state().deleteWorkout('old')
    cloud.workouts.push(workout('new', 2))
    rev++
    await state().syncNow()
    expect(state().workouts.map(w => w.id)).toEqual(['new'])
    expect(cloud.workouts.map(w => w.id)).toEqual(['new'])
  })
  it('选择仅影响冲突行，保留双方恢复点与独立行', async () => {
    connect()
    state().logBodyweight(72)
    cloud = {
      ...document(),
      bodyweight: [
        { d: '2026-10-21', kg: 80 },
        { d: '2026-10-20', kg: 79 },
      ],
    }
    rev = 2
    expect(await state().syncNow()).toBe('conflict')
    expect(state().bodyweight[0].kg).toBe(72)
    expect(JSON.parse(memory.get('gym_gym_v1')).state.sync.conflict).toBeNull()
    expect(await state().resolveConflict('remote')).toBe('synced')
    expect(state().bodyweight.map(r => r.kg)).toEqual([80, 79])
    expect(JSON.parse(backup.value.json).bodyweight[0].kg).toBe(72)
    expect(JSON.parse(backup.value.remoteJson).bodyweight[0].kg).toBe(80)
  })
  it('冲突后继续编辑会重新计算，旧选择不能覆盖新数据', async () => {
    connect()
    state().logBodyweight(72)
    cloud = { ...document(), bodyweight: [{ d: '2026-10-21', kg: 80 }] }
    await state().syncNow()
    state().logBodyweight(73)
    expect(await state().resolveConflict('remote')).toBe('conflict')
    expect(state().bodyweight[0].kg).toBe(73)
  })
  it('409 重新拉取合并，使用新的 revision', async () => {
    connect()
    vi.mocked(pushData).mockImplementationOnce(async () => {
      cloud = { ...document(), bodyweight: [{ d: '2026-10-20', kg: 80 }] }
      rev = 1
      return { ok: false, status: 409 }
    })
    expect(await state().syncNow()).toBe('synced')
    expect(state().bodyweight[0].kg).toBe(80)
    expect(state().sync.rev).toBeGreaterThanOrEqual(1)
  })
  it('同步祖先只存摘要，不再复制整份文档', async () => {
    connect()
    await state().syncNow()
    expect(state().sync.base).toEqual(await fingerprints(document()))
    expect(state().sync.base.settings.value).toMatch(/^[0-9a-f]{64}$/)
  })
})
