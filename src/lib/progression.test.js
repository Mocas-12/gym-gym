import { describe, it, expect } from 'vitest'
import { nextTarget, sessionsOf, DEFAULT_CFG, deloadKg } from './progression.js'

let seq = 0
const w = (exId, sets, daysAgo = 0) => ({
  id: 'w' + ++seq,
  start: Date.now() - daysAgo * 86400000,
  end: Date.now(),
  entries: [{ exId, sets: sets.map(s => ({ ...s, done: true })) }],
})
const cfg = DEFAULT_CFG() // double 6-10, inc 2.5

describe('sessionsOf', () => {
  it('热身组不参与重量与达标判断', () => {
    const ws = [
      w('bench', [
        { kg: 20, reps: 5, w: true },
        { kg: 100, reps: 10 },
      ]),
    ]
    expect(nextTarget(cfg, ws, 'bench')).toMatchObject({ kg: 102.5, reps: 6 })
  })
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
    const ws = [
      w('bench', [
        { kg: 60, reps: 10 },
        { kg: 60, reps: 10 },
      ]),
    ]
    expect(nextTarget(cfg, ws, 'bench')).toMatchObject({ kg: 62.5, reps: 6 })
  })
  it('有组不足 min → 减载 10%', () => {
    const ws = [
      w('bench', [
        { kg: 62.5, reps: 5 },
        { kg: 62.5, reps: 8 },
      ]),
    ]
    expect(nextTarget(cfg, ws, 'bench')).toMatchObject({ kg: deloadKg(62.5), reps: 6 })
  })
  it('区间内 → 重量不变，次数 +1 往上推', () => {
    const ws = [
      w('bench', [
        { kg: 60, reps: 8 },
        { kg: 60, reps: 7 },
      ]),
    ]
    expect(nextTarget(cfg, ws, 'bench')).toMatchObject({ kg: 60, reps: 9 })
  })
})

describe('线性', () => {
  const lin = { scheme: 'linear', inc: 2.5, reps: 8 }
  it('全中 → 加重', () => {
    const ws = [
      w('bench', [
        { kg: 60, reps: 8 },
        { kg: 60, reps: 9 },
      ]),
    ]
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

describe('Greyskull LP', () => {
  const gk = { scheme: 'greyskull', inc: 2.5, reps: 5, bonusInc: 2.5 }
  it('全中 → 加重', () => {
    const ws = [
      w('bench', [
        { kg: 60, reps: 5 },
        { kg: 60, reps: 5 },
        { kg: 60, reps: 6 },
      ]),
    ]
    expect(nextTarget(gk, ws, 'bench')).toMatchObject({ kg: 62.5 })
  })
  it('最后一组冲到目标+2 → 双倍加重', () => {
    const ws = [
      w('bench', [
        { kg: 60, reps: 5 },
        { kg: 60, reps: 5 },
        { kg: 60, reps: 7 },
      ]),
    ]
    expect(nextTarget(gk, ws, 'bench')).toMatchObject({ kg: 65 })
  })
  it('连续两次没中 → 减载', () => {
    const ws = [w('bench', [{ kg: 65, reps: 4 }]), w('bench', [{ kg: 65, reps: 3 }], 3)]
    expect(nextTarget(gk, ws, 'bench').kg).toBe(deloadKg(65))
  })
})

describe('三进程', () => {
  const tp = { scheme: 'triple', inc: 2.5, min: 6, max: 10, sets: 3, setsMax: 4 }
  it('全部顶到 max 但组数没满 → 加一组', () => {
    const ws = [
      w('bench', [
        { kg: 60, reps: 10 },
        { kg: 60, reps: 10 },
        { kg: 60, reps: 10 },
      ]),
    ]
    const t = nextTarget(tp, ws, 'bench')
    expect(t).toMatchObject({ kg: 60, reps: 10, sets: 4 })
  })
  it('组数加满且全中 → 加重回下限和基础组数', () => {
    const ws = [
      w('bench', [
        { kg: 60, reps: 10 },
        { kg: 60, reps: 10 },
        { kg: 60, reps: 10 },
        { kg: 60, reps: 10 },
      ]),
    ]
    expect(nextTarget(tp, ws, 'bench')).toMatchObject({ kg: 62.5, reps: 6, sets: 3 })
  })
  it('区间内 → 次数上推', () => {
    const ws = [
      w('bench', [
        { kg: 60, reps: 8 },
        { kg: 60, reps: 7 },
        { kg: 60, reps: 8 },
      ]),
    ]
    expect(nextTarget(tp, ws, 'bench')).toMatchObject({ kg: 60, reps: 9, sets: 3 })
  })
})

describe('计时递增', () => {
  const tm = { scheme: 'time', targetSec: 45, incSec: 5, maxSec: 120 }
  it('全部达标 → 目标秒数增加（秒存 sec 字段）', () => {
    const ws = [w('plank', [{ sec: 45 }, { sec: 45 }, { sec: 50 }])]
    expect(nextTarget(tm, ws, 'plank')).toMatchObject({ sec: 50, reps: null })
  })
  it('没达标 → 目标不变', () => {
    const ws = [w('plank', [{ sec: 40 }, { sec: 45 }])]
    expect(nextTarget(tm, ws, 'plank')).toMatchObject({ sec: 45 })
  })
  it('到上限后保持', () => {
    const ws = [w('plank', [{ sec: 130 }, { sec: 125 }])]
    expect(nextTarget({ ...tm, targetSec: 120 }, ws, 'plank').note).toContain('上限')
  })
  it('旧数据（秒存在 kg 字段）同样识别', () => {
    const ws = [w('plank', [{ kg: 45 }, { kg: 46 }])]
    expect(nextTarget(tm, ws, 'plank')).toMatchObject({ kg: 50 })
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
    const ws = [
      {
        id: 'wx',
        start: Date.now(),
        end: Date.now(),
        entries: [
          {
            exId: 'bench',
            sets: [
              { kg: 60, reps: 10, done: false }, // 未完成 → 不算
              { kg: 0, reps: 10, done: true }, // 零重量 → 不算
              { kg: 55, reps: 10, done: true }, // 有效：55kg×10 顶到 max → 57.5
            ],
          },
        ],
      },
    ]
    expect(nextTarget(cfg, ws, 'bench').kg).toBe(57.5)
  })
})
