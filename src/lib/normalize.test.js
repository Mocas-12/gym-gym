import { describe, it, expect } from 'vitest'
import { normalizeState } from './normalize.js'

describe('normalizeState（历史页崩溃的终极防线）', () => {
  it('对象形态的标题和提示不会被交给 React 渲染', () => {
    const p = normalizeState({
      workouts: [{ name: {}, entries: [{ exId: 'bench', name: {}, note: {}, sets: [] }] }],
    })
    expect(p.workouts[0].name).toBe('训练')
    expect(p.workouts[0].entries[0]).toMatchObject({ name: 'bench', note: '' })
  })
  it('清理嵌套的组、非法数值和进行中训练', () => {
    const p = normalizeState({
      workouts: [
        {
          id: 'w',
          entries: [{ exId: 'bench', sets: [null, 'bad', { kg: -5, reps: Infinity, done: true }] }],
        },
      ],
      active: { entries: null },
    })
    expect(p.workouts[0].entries[0].sets).toEqual([{ done: true }])
    expect(p.active).toBeNull()
  })
  it('滤掉 null 训练、null 动作条目与无效记录', () => {
    const p = normalizeState({
      workouts: [
        null,
        { id: 'w1', entries: [{ exId: 'bench', sets: [{ kg: 60, reps: 8, done: true }] }, null] },
        { id: 'bad' }, // 缺 entries
        { id: 'w2', entries: [null, { exId: 'x', sets: [] }] }, // null 条目被剔除，有效条目保留
      ],
      bodyweight: [null, { d: '2026-10-12', kg: 72 }],
      customEx: [{ id: 'c1', n: '自定义' }, null, {}],
    })
    expect(p.workouts).toHaveLength(2)
    expect(p.workouts[0].entries).toHaveLength(1)
    expect(p.bodyweight).toHaveLength(1)
    expect(p.customEx).toHaveLength(1)
  })
  it('干净数据原样通过（不改内容）', () => {
    const p = { workouts: [{ id: 'w', entries: [{ exId: 'a', sets: [] }] }], bodyweight: [], customEx: [] }
    const out = normalizeState(p)
    expect(out.workouts[0]).toEqual(p.workouts[0])
  })
  it('字段缺失时安全兜底', () => {
    expect(normalizeState({}).workouts).toEqual([])
    expect(normalizeState(null)).toBeNull()
  })
  it('畸形模板、计划和设置不会进入渲染与组数计算', () => {
    const p = normalizeState({
      routines: [
        null,
        {
          id: 'r',
          name: {},
          exIds: [null, 'bench'],
          supersets: [null, ['bench', null]],
          cfg: { scheme: 'triple', sets: 1e9, min: 8, max: 2 },
        },
      ],
      customEx: [{ id: 'c', n: {} }],
      settings: { restSec: 'bad', plates: { bar: -1, avail: [0, '10', 10] } },
      plan: { mode: 'bad', week: { 1: 'r', 7: 'bad' }, rotation: [null, 'r'] },
    })
    expect(p.routines[0]).toMatchObject({
      name: 'r',
      exIds: ['bench'],
      supersets: [['bench']],
      cfg: { sets: 3, min: 8, max: 8 },
    })
    expect(p.customEx[0].n).toBe('c')
    expect(p.settings).toMatchObject({ restSec: 90, plates: { bar: 20, avail: [10] } })
    expect(p.plan).toEqual({ mode: 'week', week: { 1: 'r' }, rotation: ['r'] })
  })
})
