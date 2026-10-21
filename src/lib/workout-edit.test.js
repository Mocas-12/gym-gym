import { expect, it } from 'vitest'
import { editedWorkoutTimes } from './workout-edit.js'

it('只修改名称时原样保留五分钟训练的开始和结束时间', () => {
  const start = +new Date('2026-10-21T07:12:34.567')
  expect(editedWorkoutTimes({ start, end: start + 300000 }, '2026-10-21')).toEqual({
    start,
    end: start + 300000,
  })
})
it('修改日期时保留钟点、秒和原时长', () => {
  const start = +new Date('2026-10-21T07:12:34.567')
  expect(editedWorkoutTimes({ start, end: start + 300000 }, '2026-10-20')).toEqual({
    start: +new Date('2026-10-20T07:12:34.567'),
    end: +new Date('2026-10-20T07:17:34.567'),
  })
})
it('补记仍使用中午默认值，旧记录缺结束时间时不凭空补十分钟', () => {
  const start = +new Date('2026-10-21T12:00:00')
  expect(editedWorkoutTimes(null, '2026-10-21')).toEqual({ start, end: start + 3600000 })
  expect(editedWorkoutTimes({ start }, '2026-10-21')).toEqual({ start, end: start })
})
