import { describe, it, expect } from 'vitest'
import { normalizeState } from './normalize.js'

describe('normalizeState（历史页崩溃的终极防线）', () => {
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
})
