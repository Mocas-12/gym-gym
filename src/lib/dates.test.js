import { expect, it } from 'vitest'
import { localDate, isThisMonth } from './dates.js'
import { heatmap } from './insights.js'
import { execFileSync } from 'node:child_process'
import process from 'node:process'

it('即使 CI 使用 UTC，东京凌晨的归日回归仍然会被检查', () => {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict'
    import { localDate } from './src/lib/dates.js'
    import { heatmap } from './src/lib/insights.js'
    const start = Date.parse('2026-10-21T00:30:00+09:00')
    assert.equal(localDate(start), '2026-10-21')
    assert.equal(heatmap([{ start, volume: 100 }], 2, Date.parse('2026-10-21T12:00:00+09:00')).at(-1).v, 100)
  `,
    ],
    { env: { ...process.env, TZ: 'Asia/Tokyo' } }
  )
})

it('凌晨记录使用本地日期，热力图与之保持一致', () => {
  const start = new Date(2026, 9, 21, 0, 30).getTime()
  expect(localDate(start)).toBe('2026-10-21')
  expect(heatmap([{ start, volume: 100 }], 2, new Date(2026, 9, 21, 12).getTime())).toEqual([
    { d: '2026-10-20', v: 0 },
    { d: '2026-10-21', v: 100 },
  ])
})
it('本月统计不会包括去年同月', () => {
  const now = new Date(2026, 9, 21).getTime()
  expect(isThisMonth(new Date(2025, 9, 21).getTime(), now)).toBe(false)
  expect(isThisMonth(now, now)).toBe(true)
})
