import { expect, it } from 'vitest'
import { boundedSetCount, validSet } from './sets.js'

it.each([null, NaN, Infinity, -1, 0, '1000000000', 1e9, 3.9])('组数 %s 总是落在 1～50 的整数范围', value => {
  const n = boundedSetCount(value)
  expect(Number.isInteger(n)).toBe(true)
  expect(n).toBeGreaterThanOrEqual(1)
  expect(n).toBeLessThanOrEqual(50)
})
it('无效组不能算完成；合法自重、计时、有氧组可以', () => {
  expect(validSet({ kg: null, reps: null })).toBe(false)
  expect(validSet({ kg: -60, reps: 8 })).toBe(false)
  expect(validSet({ kg: 60, reps: NaN })).toBe(false)
  expect(validSet({ kg: 60, reps: 1.5 })).toBe(false)
  expect(validSet({ kg: 0, reps: 8 })).toBe(true)
  expect(validSet({ sec: 0 }, 'time')).toBe(false)
  expect(validSet({ sec: 45 }, 'time')).toBe(true)
  expect(validSet({ kg: 45 }, 'time')).toBe(true)
  expect(validSet({ min: null }, 'cardio')).toBe(false)
  expect(validSet({ min: 10, speed: -3 }, 'cardio')).toBe(false)
  expect(validSet({ min: 10 }, 'cardio')).toBe(true)
})
