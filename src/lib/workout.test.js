import { describe, it, expect } from 'vitest'
import { finalizeWorkout, prefillFor, withStats } from './workout.js'

const mkActive = entries => ({ id: 'a', d: '2026-10-11', name: '测试', start: 1, entries })
const pastWorkout = entries => ({ id: 'w1', entries })

describe('finalizeWorkout', () => {
  it('剔除未完成组和空动作，没有完成组则拒绝归档', () => {
    const a = mkActive([
      {
        exId: 'bench',
        name: '杠铃卧推',
        sets: [
          { kg: 60, reps: 8, done: true },
          { kg: 70, reps: 5, done: false },
        ],
      },
      { exId: 'fly', name: '哑铃飞鸟', sets: [{ kg: 10, reps: 12, done: false }] },
    ])
    const { workout } = finalizeWorkout(a, [])
    expect(workout.entries).toHaveLength(1)
    expect(workout.entries[0].sets).toHaveLength(1)
    expect(workout.volume).toBe(480)

    expect(
      finalizeWorkout(mkActive([{ exId: 'x', name: 'x', sets: [{ kg: 1, reps: 1, done: false }] }]), [])
        .workout
    ).toBeNull()
  })
  it('容量 = Σ 完成组 kg×reps', () => {
    const a = mkActive([
      {
        exId: 's',
        name: '深蹲',
        sets: [
          { kg: 100, reps: 5, done: true },
          { kg: 100, reps: 5, done: true },
        ],
      },
    ])
    const { workout } = finalizeWorkout(a, [])
    expect(workout.volume).toBe(1000)
  })
  it('热身组不计容量、不进 PR', () => {
    const a = mkActive([
      {
        exId: 's',
        name: '深蹲',
        sets: [
          { kg: 40, reps: 8, done: true, w: true }, // 热身
          { kg: 100, reps: 5, done: true },
        ],
      },
    ])
    const { workout } = finalizeWorkout(a, [])
    expect(workout.volume).toBe(500)
    // 历史 90×5 → 102；本次工作组 100×5 → 116.7 是 PR，热身 40kg 不产生干扰
    const past = pastWorkout([{ exId: 's', name: '深蹲', sets: [{ kg: 90, reps: 5, done: true }] }])
    const { prs } = finalizeWorkout(a, [past])
    expect(prs.map(p => p.exId)).toContain('s')
    // 只做了热身组 → 容量为 0
    const onlyWarm = mkActive([{ exId: 's', name: '深蹲', sets: [{ kg: 40, reps: 8, done: true, w: true }] }])
    expect(finalizeWorkout(onlyWarm, []).workout.volume).toBe(0)
  })
})

describe('withStats 编辑重算', () => {
  const past = pastWorkout([{ exId: 'bench', name: '卧推', sets: [{ kg: 80, reps: 5, done: true }] }]) // 93.3
  it('改组后容量重算、PR 对照其余历史重判', () => {
    const doc = {
      id: 'w2',
      name: '卧推日',
      start: Date.now(),
      end: Date.now() + 3600e3,
      entries: [
        { exId: 'bench', name: '卧推', sets: [{ kg: 85, reps: 5, done: true }] }, // 99.2 → PR
      ],
    }
    const clean = withStats(doc, [past])
    expect(clean.volume).toBe(425)
    expect(clean.prs.map(p => p.exId)).toEqual(['bench'])
    // 改小到不破纪录 → PR 标记被移除
    const smaller = withStats(
      { ...doc, entries: [{ exId: 'bench', name: '卧推', sets: [{ kg: 60, reps: 5, done: true }] }] },
      [past]
    )
    expect(smaller.prs).toBeUndefined()
  })
})

describe('findPRs / prefillFor', () => {
  it('超过历史最佳的动作记 PR', () => {
    const past = pastWorkout([{ exId: 'bench', name: '卧推', sets: [{ kg: 80, reps: 5, done: true }] }]) // 93.3
    const a = mkActive([
      { exId: 'bench', name: '卧推', sets: [{ kg: 85, reps: 5, done: true }] }, // 99.2 → PR
      { exId: 'row', name: '划船', sets: [{ kg: 40, reps: 8, done: true }] }, // 新动作有记录
      { exId: 'curl', name: '弯举', sets: [{ kg: 10, reps: 10, done: true }] }, // 13.3 → 低于历史？
    ])
    const { prs } = finalizeWorkout(a, [past])
    expect(prs.map(p => p.exId)).toContain('bench')
    expect(prs.map(p => p.exId)).not.toContain('row') // 新动作第一次只建立基线
    expect(prs.map(p => p.exId)).not.toContain('curl')
  })

  it('prefill 取最近一次的组安排，没有历史给默认组', () => {
    const past = pastWorkout([
      {
        exId: 'bench',
        name: '卧推',
        sets: [
          { kg: 60, reps: 8, done: true },
          { kg: 65, reps: 6, done: true },
        ],
      },
    ])
    expect(prefillFor('bench', [past])).toEqual([
      { kg: 60, reps: 8, done: false },
      { kg: 65, reps: 6, done: false },
    ])
    expect(prefillFor('new-ex', [])).toEqual([{ reps: 10, kg: 0, done: false }])
  })

  it('脏数据防御：null 记录 / 缺 entries / 有氧计时组不炸不误计', () => {
    // 历史里混 null 与畸形记录（真机出过）不该炸
    const dirty = [
      null,
      { id: 'w1', entries: [{ exId: 'bench', name: '卧推', sets: [{ kg: 80, reps: 5, done: true }] }] },
      { id: 'w2', entries: 'not-array' },
    ]
    const a = mkActive([
      { exId: 'bench', name: '卧推', sets: [{ kg: 85, reps: 5, done: true }] },
      // 有氧组没有 kg×reps，容量为 0
      { exId: 'run', name: '跑步', type: 'cardio', sets: [{ min: 20, speed: 10, incl: 1, done: true }] },
    ])
    const { prs, workout } = finalizeWorkout(a, dirty)
    expect(prs.map(p => p.exId)).toContain('bench')
    expect(workout.volume).toBe(425) // 只有卧推 85×5
  })

  it('prefill 上限 8 组； workouts 未传也不炸', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ kg: 20 + i, reps: 10, done: true }))
    const past = pastWorkout([{ exId: 's', name: '深蹲', sets: many }])
    expect(prefillFor('s', [past])).toHaveLength(8)
    expect(prefillFor('s')).toEqual([{ reps: 10, kg: 0, done: false }])
  })
})
