import { expect, it } from 'vitest'
import { compareEntry, entrySummary, weeklyReview } from './review.js'

it('未净化的空数值记录也不会增加周回顾训练次数和正式组数', () => {
  const start = +new Date('2026-10-21T10:00:00')
  const history = [
    { start, entries: [{ exId: 'a', sets: [{ kg: null, reps: null, done: true }] }] },
    { start, entries: [{ exId: 'b', sets: [{ kg: 0, reps: 8, done: true }] }] },
  ]
  expect(weeklyReview(history, new Date('2026-10-21T12:00:00')).current).toMatchObject({
    sessions: 1,
    sets: 1,
  })
})

const entry = (type, sets) => ({ exId: 'x', type, sets })
it('力量、计时、有氧按各自单位比较，排除热身与未完成组', () => {
  const sets = [
    { kg: 60, reps: 8, sec: 45, min: 10, done: true },
    { kg: 100, reps: 8, sec: 99, min: 60, done: true, w: true },
    { kg: 60, reps: 8 },
  ]
  expect(entrySummary(entry('reps', sets))).toEqual({ sets: 1, value: 480, unit: 'kg 容量' })
  expect(entrySummary(entry('time', sets)).value).toBe(45)
  expect(entrySummary(entry('cardio', sets)).value).toBe(10)
  const history = [
    { d: '2026-10-19', start: 1, entries: [entry('reps', sets)] },
    { start: 5, entries: [entry('reps', [])] },
  ]
  expect(compareEntry(entry('reps', []), history, 3)).toMatchObject({ date: '2026-10-19', delta: -480 })
  expect(compareEntry(entry('time', []), history, 3)).toBeNull()
  expect(compareEntry(entry('reps', []), [], 3)).toBeNull()
})

it('周一零点为周界，本周只与上周同期比较，未来记录不计入', () => {
  const make = date => ({
    start: +new Date(date),
    end: +new Date(date) + 60000,
    entries: [entry('time', [{ sec: 45, done: true }])],
  })
  const records = [
    '2026-10-18T23:59:59',
    '2026-10-19T00:00:00',
    '2026-10-21T11:00:00',
    '2026-10-22T12:00:00',
    '2026-10-12T12:00:00',
    '2026-10-16T12:00:00',
  ].map(make)
  const review = weeklyReview(records, new Date('2026-10-21T12:00:00'))
  expect(review.from).toBe('2026-10-19')
  expect(review.to).toBe('2026-10-25')
  expect(review.current).toMatchObject({ sessions: 2, sets: 2, minutes: 2, volume: 0, timedSeconds: 90 })
  expect(review.previous.sessions).toBe(1)
  expect(weeklyReview(records, new Date('2026-10-21T12:00:00'), -1).current.sessions).toBe(3)
})

it('空周与跨年周均有稳定边界', () => {
  const review = weeklyReview([], new Date('2027-01-01T12:00:00'))
  expect(review.from).toBe('2026-12-28')
  expect(review.to).toBe('2027-01-03')
  expect(review.current.sessions).toBe(0)
})
