import { describe, it, expect } from 'vitest'
import { e1rmSeries, heatmap, muscleLoad, recoveryStatus, trainedExercises } from './insights.js'

const NOW = new Date('2026-10-12T12:00:00').getTime()
const DAY = 86400000
const mk = (daysAgo, entries, volume = 0) => ({
  id: 'w' + daysAgo,
  start: NOW - daysAgo * DAY,
  end: NOW,
  volume,
  entries,
})

describe('e1rmSeries', () => {
  it('按天聚合取最高、时间升序', () => {
    const ws = [
      mk(0, [{ exId: 'bench', sets: [{ kg: 80, reps: 3, done: true }] }]), // 88
      mk(1, [{ exId: 'bench', sets: [{ kg: 82.5, reps: 3, done: true }] }]), // 90.75
      mk(1, [{ exId: 'bench', sets: [{ kg: 85, reps: 2, done: true }] }]), // 同天 90.67，取更高 90.75
      mk(2, [{ exId: 'bench', sets: [{ kg: 0, reps: 10, done: true }] }]), // 零重量跳过
      mk(2, [{ exId: 'row', sets: [{ kg: 40, reps: 8, done: true }] }]), // 别的动作
    ]
    const s = e1rmSeries(ws, 'bench')
    expect(s).toHaveLength(2)
    expect(s[0].v).toBeCloseTo(90.8, 1)
    expect(s[1].v).toBeCloseTo(88, 1)
    expect(s[0].t < s[1].t).toBe(true)
  })
})

describe('heatmap', () => {
  it('365 天按日聚合容量，缺失日补 0', () => {
    const ws = [mk(0, [], 1000), mk(3, [], 500)]
    const grid = heatmap(ws, 364, NOW)
    expect(grid).toHaveLength(364)
    expect(grid[grid.length - 1].v).toBe(1000)
    expect(grid[grid.length - 4].v).toBe(500)
    expect(grid[grid.length - 2].v).toBe(0)
  })
})

describe('muscleLoad / recoveryStatus', () => {
  it('按肌群聚合完成组数与距上次小时数，跳过未知肌群', () => {
    const ws = [
      mk(1, [
        { exId: 'squat', m: '腿', sets: [{ done: true }, { done: true }, { done: false }] },
        { exId: 'curl', m: '手臂', sets: [{ done: true }] },
        { exId: 'custom-x', sets: [{ done: true }] }, // 无 m → 跳过
      ]),
    ]
    const ml = muscleLoad(ws, 7, NOW)
    expect(ml.find(x => x.m === '腿')).toMatchObject({ sets: 2 })
    expect(ml.find(x => x.m === '手臂')).toMatchObject({ sets: 1 })
    expect(ml).toHaveLength(2)
    expect(ml[0].hoursAgo).toBe(24)
  })
  it('恢复状态：大肌群 72h、小时数越接近阈值恢复越少', () => {
    const r = recoveryStatus(
      [
        { m: '腿', sets: 5, hoursAgo: 24 },
        { m: '核心', sets: 3, hoursAgo: 30 },
      ],
      NOW
    )
    expect(r[0]).toMatchObject({ recovered: false, pct: 33 })
    expect(r[1]).toMatchObject({ recovered: true, pct: 100 })
  })
})

describe('trainedExercises', () => {
  it('按新到旧去重动作 id', () => {
    const ws = [mk(0, [{ exId: 'a' }, { exId: 'b' }]), mk(2, [{ exId: 'a' }])]
    expect(trainedExercises(ws)).toEqual(['a', 'b'])
  })
})

describe('脏数据防御（真机曾出现 null 记录导致历史页崩溃）', () => {
  it('workouts 里的 null / 缺 start 的记录全部被跳过', () => {
    const ws = [
      null,
      mk(0, [{ exId: 'bench', m: '胸', sets: [{ kg: 60, reps: 8, done: true }] }]),
      { id: 'bad' }, // 缺 start
    ]
    expect(() => {
      e1rmSeries(ws, 'bench')
      heatmap(ws, 30, NOW)
      muscleLoad(ws, 7, NOW)
      trainedExercises(ws)
    }).not.toThrow()
    expect(e1rmSeries(ws, 'bench')).toHaveLength(1)
    expect(trainedExercises(ws)).toEqual(['bench'])
  })
})
