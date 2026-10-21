/* 洞察数据纯函数：1RM 曲线、全年热力图、肌群负荷/恢复。全部只读历史，可单测。 */
// @ts-check
import { best1RM } from './onerm.js'
import { MUSCLES } from '../data/exercises.js'
import { localDate } from './dates.js'

const DAY = 86400000

/** @param {number} ts @returns {string} YYYY-MM-DD */
const dayKey = ts => localDate(ts)

/**
 * 某动作按时间排序的估计 1RM 序列（同一天取最高）。
 * @param {(import('./types.js').Workout|null)[]} workouts
 * @param {string} exId
 * @returns {{ t: number, v: number }[]}
 */
export function e1rmSeries(workouts, exId) {
  /** @type {Record<string, number>} */
  const byDay = {}
  for (const w of workouts || []) {
    if (!w || !w.start) continue
    for (const e of w.entries || []) {
      if (e?.exId !== exId || e.type === 'time' || e.type === 'cardio') continue
      const v = best1RM(e.sets)
      if (v <= 0) continue
      const k = dayKey(w.start)
      byDay[k] = Math.max(byDay[k] || 0, v)
    }
  }
  return Object.entries(byDay)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([d, v]) => ({ t: new Date(d + 'T12:00:00').getTime(), v: Math.round(v * 10) / 10 }))
}

/**
 * 训练过的动作 id 列表（新的在前，用于选择器）。
 * @param {(import('./types.js').Workout|null)[]} [workouts]
 * @returns {string[]}
 */
export function trainedExercises(workouts) {
  /** @type {string[]} */
  const seen = []
  for (const w of workouts || []) {
    if (!w) continue
    for (const e of w.entries || []) {
      if (e && !seen.includes(e.exId)) seen.push(e.exId)
    }
  }
  return seen
}

/**
 * 最近 days 天热力图：每天的总容量（kg）。返回按时间升序的点，缺的日子补 0。
 * @param {(import('./types.js').Workout|null)[]} [workouts]
 * @param {number} [days]
 * @param {number} [now]
 * @returns {{ d: string, v: number }[]}
 */
export function heatmap(workouts, days = 364, now = Date.now()) {
  /** @type {Record<string, number>} */
  const byDay = {}
  for (const w of workouts || []) {
    if (!w || !w.start) continue
    const k = dayKey(w.start)
    byDay[k] = (byDay[k] || 0) + (w.volume || 0)
  }
  /** @type {{ d: string, v: number }[]} */
  const out = []
  const start = new Date(now)
  start.setDate(start.getDate() - days + 1)
  start.setHours(12, 0, 0, 0)
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const k = localDate(d)
    out.push({ d: k, v: Math.round(byDay[k] || 0) })
  }
  return out
}

/**
 * 肌群负荷：近 days 天内每个肌群的「做过的组数」和距上次训练的小时数。
 * 依赖 entry.m（建条目时从动作库带上）；旧数据没有 m 会被跳过。只含有记录的肌群。
 * @param {(import('./types.js').Workout|null)[]} [workouts]
 * @param {number} [days]
 * @param {number} [now]
 * @returns {{ m: string, sets: number, hoursAgo: number }[]}
 */
export function muscleLoad(workouts, days = 7, now = Date.now()) {
  /** @type {Record<string, { sets: number, last: number }>} */
  const stats = {}
  const cutoff = now - days * DAY
  for (const w of workouts || []) {
    if (!w || !w.start || w.start < cutoff) continue
    for (const e of w.entries || []) {
      if (!e.m || !MUSCLES.includes(e.m)) continue
      const sets = (e.sets || []).filter(s => s.done && !s.w).length
      if (!sets) continue
      stats[e.m] = stats[e.m] || { sets: 0, last: 0 }
      stats[e.m].sets += sets
      stats[e.m].last = Math.max(stats[e.m].last, w.start)
    }
  }
  return Object.entries(stats)
    .map(([m, { sets, last }]) => ({ m, sets, hoursAgo: Math.round((now - last) / 3600000) }))
    .sort((a, b) => b.sets - a.sets)
}

/* 恢复状态：大肌群 72h、小肌群 48h 内练过 → 恢复中；超时 → 已恢复。
 * 肌群分类粗略：腿/背/胸=72h，其余=48h。 */
/** @type {Record<string, number>} */
const RECOVERY_H = { 腿: 72, 背: 72, 胸: 72, 肩: 48, 手臂: 48, 臀: 48, 核心: 24, 有氧: 12 }

/**
 * 给肌群负荷补上恢复百分比与是否已恢复。
 * @param {{ m: string, sets: number, hoursAgo: number }[]} muscles
 * @param {number} [_now] 预留（恢复度只依赖 hoursAgo）
 * @returns {({ m: string, sets: number, hoursAgo: number, pct: number, recovered: boolean })[]}
 */
export function recoveryStatus(muscles, _now = Date.now()) {
  return muscles.map(x => {
    const need = RECOVERY_H[x.m] ?? 48
    const pct = Math.min(100, Math.round((x.hoursAgo / need) * 100))
    return { ...x, pct, recovered: x.hoursAgo >= need }
  })
}
