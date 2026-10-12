import { describe, it, expect } from 'vitest'
import { weightsOf, regionLoad, volumeLevels, recoveryLevels, neglectedLevels, MUSCLES } from './muscles.js'

const NOW = new Date('2026-10-12T12:00:00').getTime()
const DAY = 86400000
const w = (daysAgo, entries) => ({ id: 'w' + daysAgo, start: NOW - daysAgo * DAY, entries })

describe('weightsOf', () => {
  it('标注动作：主发 1.0、辅发 0.4', () => {
    expect(weightsOf({ id: 'bench' })).toEqual({ chest: 1, triceps: 0.4, deltoids: 0.4 })
  })
  it('未标注动作按粗肌群回退（权重和为 1）', () => {
    expect(weightsOf({ id: 'custom-x', m: '肩' })).toEqual({ deltoids: 1 })
    const back = weightsOf({ id: 'custom-y', m: '背' })
    expect(back['upper-back']).toBeCloseTo(0.7)
    expect(back['lower-back']).toBeCloseTo(0.3)
  })
  it('有氧回退为空（不上色）', () => {
    expect(weightsOf({ id: 'custom-run', m: '有氧' })).toEqual({})
  })
})

describe('regionLoad', () => {
  it('只计窗口内完成组（非热身），主辅加权', () => {
    const ws = [
      w(1, [{ exId: 'bench', m: '胸', sets: [{ done: true }, { done: true }, { done: true, w: true }, { done: false }] }]),
      w(10, [{ exId: 'bench', m: '胸', sets: [{ done: true }] }]), // 窗口外
    ]
    const load = regionLoad(ws, 7, NOW)
    expect(load.chest).toBeCloseTo(2)
    expect(load.triceps).toBeCloseTo(0.8)
  })
})

describe('三种模式等级', () => {
  const ws = [
    w(0, [{ exId: 'squat', m: '腿', sets: [{ done: true }, { done: true }, { done: true }, { done: true }] }]),
    w(6, [{ exId: 'bench', m: '胸', sets: [{ done: true }, { done: true }] }]),
    w(20, [{ exId: 'db-curl', m: '手臂', sets: [{ done: true }] }]),
  ]
  it('容量：相对最强肌群分档', () => {
    const lv = volumeLevels(regionLoad(ws, 7, NOW))
    expect(lv.quadriceps).toBe(4)   // 4 组主发 = 最强
    expect(lv.hamstring).toBeGreaterThanOrEqual(1) // 辅发也有色
    expect(lv.biceps).toBe(0)       // 6 天前，窗口外
  })
  it('恢复：进度越高越亮，需求按肌群大小', () => {
    const lv = recoveryLevels(ws, NOW)
    expect(lv.quadriceps).toBe(0)   // 今天刚练 72h 需求 → 进度 0
    expect(lv.biceps).toBe(4)       // 6 天 > 48h 需求 → 完全恢复
  })
  it('盲区：越久没练越亮，从没练过最亮', () => {
    const lv = neglectedLevels(ws, NOW)
    expect(lv.quadriceps).toBe(0)   // 今天练过
    expect(lv.biceps).toBe(3)       // 6 天
    expect(lv['db-row'] === undefined).toBe(true)
    expect(lv.forearm).toBe(3)      // 20 天前被弯举的辅发碰过
    expect(lv.serratus).toBe(4)     // 从没练过
  })
  it('所有肌群都有等级值', () => {
    const lv = neglectedLevels(ws, NOW)
    MUSCLES.forEach(m => expect(lv[m]).toBeDefined())
  })
})
