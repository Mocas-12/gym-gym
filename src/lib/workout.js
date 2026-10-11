/* 训练会话的纯逻辑：容量、PR 判定、收尾归档、重量预填。
 * 全部纯函数，配单测 —— 这里是“决定你举多重”的领域逻辑。 */
import { best1RM } from './onerm.js'

export function entryVolume(e) {
  return (e.sets || []).reduce((sum, s) => sum + (s.done && s.kg > 0 && s.reps > 0 ? s.kg * s.reps : 0), 0)
}

export function workoutVolume(active) {
  return (active.entries || []).reduce((sum, e) => sum + entryVolume(e), 0)
}

/* 与历史对比：本会话中出现且 1RM 估计超过历史最佳的练习 → PR 列表 */
export function findPRs(active, workouts) {
  const past = {}
  for (const w of workouts || []) {
    for (const e of w.entries || []) {
      const b = best1RM(e.sets)
      if (b > (past[e.exId] || 0)) past[e.exId] = b
    }
  }
  const prs = []
  for (const e of active.entries || []) {
    const now = best1RM(e.sets)
    // 只在"曾有过记录且这次更好"时记 PR：新动作的第一次只建立基线
    if (past[e.exId] != null && now > past[e.exId]) prs.push({ exId: e.exId, name: e.name, e1rm: Math.round(now * 10) / 10 })
  }
  return prs
}

/* 收尾：剔除空动作/空组，算容量与 PR，产出可归档的训练文档。没有完成的组则返回 null。 */
export function finalizeWorkout(active, workouts) {
  const entries = (active.entries || [])
    .map(e => ({ ...e, sets: (e.sets || []).filter(s => s.done) }))
    .filter(e => e.sets.length > 0)
  if (!entries.length) return { workout: null, prs: [] }
  const doc = { ...active, entries, end: Date.now(), volume: 0 }
  doc.volume = workoutVolume(doc)
  const prs = findPRs(doc, workouts)
  if (prs.length) doc.prs = prs
  return { workout: doc, prs }
}

/* 预填：找到最近一次做这个动作的组数安排，作为本组起点（openGym 的“重量自动带出”）。 */
export function prefillFor(exId, workouts) {
  for (const w of workouts || []) {
    const e = (w.entries || []).find(x => x.exId === exId)
    if (e && (e.sets || []).length) return e.sets.slice(0, 8).map(s => ({ reps: s.reps, kg: s.kg, done: false }))
  }
  return [{ reps: 10, kg: 0, done: false }]
}
