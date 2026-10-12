import { describe, it, expect } from 'vitest'
import { platesFor, fmtPlates, STANDARD_PLATES } from './plates.js'

describe('platesFor', () => {
  it('标准配置常见重量', () => {
    expect(platesFor(60, 20)).toEqual({ perSide: [20], leftover: 0, tooLight: false })
    expect(platesFor(100, 20).perSide).toEqual([25, 15])
    expect(platesFor(70, 20).perSide).toEqual([25])
    expect(platesFor(62.5, 20).perSide).toEqual([20, 1.25])
    expect(platesFor(50, 20).perSide).toEqual([15]) // 贪心优先大片
  })
  it('缺大片时用小片凑', () => {
    expect(platesFor(70, 20, [10, 5, 2.5, 1.25]).perSide).toEqual([10, 10, 5])
  })
  it('凑不出整（没有足够小片）报告残差', () => {
    const r = platesFor(61, 20, [10, 5])
    expect(r.perSide).toEqual([10, 10])
    expect(r.leftover).toBeCloseTo(0.5, 5)
  })
  it('低于空杆重量标记 tooLight', () => {
    expect(platesFor(15, 20).tooLight).toBe(true)
    expect(platesFor(20, 20).perSide).toEqual([])
  })
  it('fmtPlates 空数组显示空杆', () => {
    expect(fmtPlates([25, 5])).toBe('25 + 5')
    expect(fmtPlates([])).toBe('空杆')
  })
  it('标准片表从大到小', () => {
    expect([...STANDARD_PLATES].sort((a, b) => b - a)).toEqual(STANDARD_PLATES)
  })
})
