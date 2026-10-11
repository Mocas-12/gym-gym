import { describe, it, expect } from 'vitest'
import { nextTarget, sessionsOf, DEFAULT_CFG, deloadKg } from './progression.js'

let seq = 0
const w = (exId, sets, daysAgo = 0) => ({
  id: 'w' + (++seq), start: Date.now() - daysAgo * 86400000, end: Date.now(),
  entries: [{ exId, sets: sets.map(s => ({ ...s, done: true })) }],
})
const cfg = DEFAULT_CFG() // double 6-10, inc 2.5

describe('sessionsOf', () => {
  it('只取该动作最近的完成组，跳过没有的训练', () => {
    const ws = [
      w('bench', [{ kg: 60, reps: 8 }]),
      w('row', [{ kg: 40, reps: 10 }]),
      w('bench', [{ kg: 57.5, reps: 8 }], 3),
    ]
    expect(sessionsOf(ws, 'bench', 2)).toHaveLength(2)
    expect(sessionsOf(ws, 'bench', 2)[0][0].kg).toBe(60)
    expect(sessionsOf(ws, 'nope')).toHaveLength(0)
  })
})

describe('双进程', () => {
  it('全部顶到 max → 加重，次数回到 min', () => {
    const ws = [w('bench', [{ kg: 60, reps: 10 }, { kg: 60, reps: 10 }])]
    expect(nextTarget(cfg, ws, 'bench')).toMatchObject({ kg: 62.5, reps: 6 })
  })
  it('有组不足 min → 减载 10%', () => {
    const ws = [w('bench', [{ kg: 62.5, reps: 5 }, { kg: 62.5, reps: 8 }])]
    expect(nextTarget(cfg, ws, 'bench')).toMatchObject({ kg: deloadKg(62.5), reps: 6 })
  })
  it('区间内 → 重量不变，次数 +1 往上推', () => {
    const ws = [w('bench', [{ kg: 60, reps: 8 }, { kg: 60, reps: 7 }])]
    expect(nextTarget(cfg, ws, 'bench')).toMatchObject({ kg: 60, reps: 9 })
  })
})

describe('线性', () => {
  const lin = { scheme: 'linear', inc: 2.5, reps: 8 }
  it('全中 → 加重', () => {
    const ws = [w('bench', [{ kg: 60, reps: 8 }, { kg: 60, reps: 9 }])]
    expect(nextTarget(lin, ws, 'bench')).toMatchObject({ kg: 62.5, reps: 8 })
  })
  it('第一次没中 → 重量不变', () => {
    const ws = [w('bench', [{ kg: 62.5, reps: 6 }])]
    expect(nextTarget(lin, ws, 'bench')).toMatchObject({ kg: 62.5 })
  })
  it('连续两次没中 → 减载', () => {
    const ws = [w('bench', [{ kg: 62.5, reps: 6 }]), w('bench', [{ kg: 62.5, reps: 7 }], 2)]
    expect(nextTarget(lin, ws, 'bench').kg).toBe(deloadKg(62.5))
  })
})

describe('边界', () => {
  it('无历史 → null（交给预填）', () => {
    expect(nextTarget(cfg, [], 'bench')).toBeNull()
  })
  it('scheme=none → null', () => {
    const ws = [w('bench', [{ kg: 60, reps: 10 }])]
    expect(nextTarget({ ...cfg, scheme: 'none' }, ws, 'bench')).toBeNull()
    expect(nextTarget(null, ws, 'bench')).toBeNull()
  })
  it('只跳过未完成/零重量组', () => {
    const ws = [{
      id: 'wx', start: Date.now(), end: Date.now(),
      entries: [{ exId: 'bench', sets: [
        { kg: 60, reps: 10, done: false },   // 未完成 → 不算
        { kg: 0, reps: 10, done: true },     // 零重量 → 不算
        { kg: 55, reps: 10, done: true },    // 有效：55kg×10 顶到 max → 57.5
      ] }],
    }]
    expect(nextTarget(cfg, ws, 'bench').kg).toBe(57.5)
  })
})
