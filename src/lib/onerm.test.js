import { describe, it, expect } from 'vitest'
import { epley, best1RM } from './onerm.js'

describe('epley 1RM', () => {
  it('单次等于自身重量', () => {
    expect(epley(100, 1)).toBe(100)
  })
  it('常见组合', () => {
    expect(epley(100, 10)).toBeCloseTo(133.33, 1)
  })
})

describe('best1RM', () => {
  it('取完成组中的最大估计值，跳过未完成/零重量组', () => {
    const sets = [
      { kg: 60, reps: 8, done: true }, // 76
      { kg: 80, reps: 3, done: true }, // 88
      { kg: 90, reps: 2, done: false }, // 未完成，忽略
      { kg: 0, reps: 20, done: true }, // 零重量，忽略
    ]
    expect(best1RM(sets)).toBeCloseTo(88, 5)
  })
})
