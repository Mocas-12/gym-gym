import { describe, it, expect } from 'vitest'
import { todayPlan, rotationNext, nextAssigned } from './plan.js'

describe('week 模式', () => {
  const plan = { mode: 'week', week: { 1: 'push', 3: 'pull', 6: 'legs' } }
  it('按星期几返回排课', () => {
    const d = new Date()
    expect(todayPlan(plan, [])).toBe(plan.week[d.getDay()] || null)
  })
  it('没排的日子返回 null', () => {
    expect(todayPlan({ mode: 'week', week: { 1: 'push' } }, [])).toBe(
      new Date().getDay() === 1 ? 'push' : null
    )
  })
})

describe('rotation 模式', () => {
  const rot = { mode: 'rotation', rotation: ['push', 'pull', 'legs'] }
  it('没做过 → 从第一个开始', () => {
    expect(todayPlan(rot, [])).toBe('push')
  })
  it('上次做完某个 → 下一个是下一个', () => {
    const ws = [{ rid: 'push' }, { rid: 'legs' }]
    expect(todayPlan(rot, ws)).toBe('pull')
  })
  it('做到最后一个 → 回绕到第一个', () => {
    expect(todayPlan(rot, [{ rid: 'legs' }])).toBe('push')
  })
  it('历史里的非轮换训练被跳过', () => {
    expect(todayPlan(rot, [{ rid: 'free' }, { rid: 'pull' }])).toBe('legs')
  })
})

describe('nextAssigned 休息日提示', () => {
  it('week 模式：今天往后找第一个排课日', () => {
    const plan = { mode: 'week', week: { 1: 'push' } }
    const monday = new Date(2026, 9, 12) // 2026-10-12 是周一
    expect(nextAssigned(plan, [], monday)).toEqual({ inDays: 0, rid: 'push' })
    expect(nextAssigned(plan, [], new Date(2026, 9, 13))).toEqual({ inDays: 6, rid: 'push' })
  })
  it('rotation 模式：下一个就是 0 天后', () => {
    expect(nextAssigned({ mode: 'rotation', rotation: ['a', 'b'] }, [{ rid: 'a' }]))
      .toEqual({ inDays: 0, rid: 'b' })
  })
})
