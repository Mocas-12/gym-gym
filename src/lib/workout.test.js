import { describe, it, expect } from 'vitest'
import { finalizeWorkout, prefillFor, findPRs } from './workout.js'

const mkActive = entries => ({ id: 'a', d: '2026-10-11', name: '测试', start: 1, entries })
const pastWorkout = entries => ({ id: 'w1', entries })

describe('finalizeWorkout', () => {
  it('剔除未完成组和空动作，没有完成组则拒绝归档', () => {
    const a = mkActive([
      { exId: 'bench', name: '杠铃卧推', sets: [{ kg: 60, reps: 8, done: true }, { kg: 70, reps: 5, done: false }] },
      { exId: 'fly', name: '哑铃飞鸟', sets: [{ kg: 10, reps: 12, done: false }] },
    ])
    const { workout } = finalizeWorkout(a, [])
    expect(workout.entries).toHaveLength(1)
    expect(workout.entries[0].sets).toHaveLength(1)
    expect(workout.volume).toBe(480)

    expect(finalizeWorkout(mkActive([{ exId: 'x', name: 'x', sets: [{ kg: 1, reps: 1, done: false }] }]), []).workout).toBeNull()
  })
  it('容量 = Σ 完成组 kg×reps', () => {
    const a = mkActive([{ exId: 's', name: '深蹲', sets: [{ kg: 100, reps: 5, done: true }, { kg: 100, reps: 5, done: true }] }])
    const { workout } = finalizeWorkout(a, [])
    expect(workout.volume).toBe(1000)
  })
})

describe('findPRs / prefillFor', () => {
  it('超过历史最佳的动作记 PR', () => {
    const past = pastWorkout([{ exId: 'bench', name: '卧推', sets: [{ kg: 80, reps: 5, done: true }] }]) // 93.3
    const a = mkActive([
      { exId: 'bench', name: '卧推', sets: [{ kg: 85, reps: 5, done: true }] },   // 99.2 → PR
      { exId: 'row', name: '划船', sets: [{ kg: 40, reps: 8, done: true }] },     // 新动作有记录
      { exId: 'curl', name: '弯举', sets: [{ kg: 10, reps: 10, done: true }] },   // 13.3 → 低于历史？
    ])
    const { prs } = finalizeWorkout(a, [past])
    expect(prs.map(p => p.exId)).toContain('bench')
    expect(prs.map(p => p.exId)).not.toContain('row')   // 新动作第一次只建立基线
    expect(prs.map(p => p.exId)).not.toContain('curl')
  })

  it('prefill 取最近一次的组安排，没有历史给默认组', () => {
    const past = pastWorkout([{ exId: 'bench', name: '卧推', sets: [{ kg: 60, reps: 8, done: true }, { kg: 65, reps: 6, done: true }] }])
    expect(prefillFor('bench', [past])).toEqual([
      { kg: 60, reps: 8, done: false }, { kg: 65, reps: 6, done: false },
    ])
    expect(prefillFor('new-ex', [])).toEqual([{ reps: 10, kg: 0, done: false }])
  })
})
