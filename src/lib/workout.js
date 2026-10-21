/* 训练会话的纯逻辑：容量、PR 判定、收尾归档、重量预填。
 * 全部纯函数，配单测 —— 这里是“决定你举多重”的领域逻辑。 */
// @ts-check
import { best1RM } from './onerm.js'

/**
 * 一个动作条目的总容量（kg×reps 累加；热身组与未完成/无效组不计）。
 * @param {import('./types.js').Entry} e
 * @returns {number}
 */
export function entryVolume(e) {
  if (e.type === 'time' || e.type === 'cardio') return 0
  // 热身组（w 标记）不计容量；无有效 kg×reps 的组（有氧/计时）也不计
  return (e.sets || []).reduce((sum, s) => {
    if (!s.done || s.w || !s.kg || !s.reps) return sum
    return sum + s.kg * s.reps
  }, 0)
}

/**
 * 一份训练的总容量。
 * @param {import('./types.js').Workout} active
 * @returns {number}
 */
export function workoutVolume(active) {
  return (active.entries || []).reduce((sum, e) => sum + entryVolume(e), 0)
}

/**
 * 与历史对比：本会话中出现且 1RM 估计超过历史最佳的练习 → PR 列表。
 * 只在「曾有过记录且这次更好」时记 PR：新动作的第一次只建立基线。
 * @param {import('./types.js').Workout} active
 * @param {(import('./types.js').Workout|null)[]} [workouts]
 * @returns {import('./types.js').PRItem[]}
 */
export function findPRs(active, workouts) {
  /** @type {Record<string, number>} */
  const past = {}
  for (const w of workouts || []) {
    if (!w) continue
    if (w.start != null && active.start != null && w.start >= active.start) continue
    for (const e of w.entries || []) {
      if (e.type === 'time' || e.type === 'cardio') continue
      const b = best1RM(e.sets)
      if (b > (past[e.exId] || 0)) past[e.exId] = b
    }
  }
  /** @type {import('./types.js').PRItem[]} */
  const prs = []
  for (const e of active.entries || []) {
    if (e.type === 'time' || e.type === 'cardio') continue
    const now = best1RM(e.sets)
    if (past[e.exId] != null && now > past[e.exId])
      prs.push({ exId: e.exId, name: e.name, e1rm: Math.round(now * 10) / 10 })
  }
  return prs
}

/**
 * 收尾：剔除空动作/空组，算容量与 PR，产出可归档的训练文档。没有完成的组则 workout 为 null。
 * @param {import('./types.js').Workout} active
 * @param {(import('./types.js').Workout|null)[]} [workouts]
 * @returns {{ workout: import('./types.js').Workout|null, prs: import('./types.js').PRItem[] }}
 */
export function finalizeWorkout(active, workouts) {
  const entries = (active.entries || [])
    .map(e => ({
      ...e,
      plannedSets: (e.sets || []).filter(s => !s.w).length,
      sets: (e.sets || []).filter(s => s.done),
    }))
    .filter(e => e.sets.length > 0)
  if (!entries.length) return { workout: null, prs: [] }
  const doc = { ...active, entries, end: Date.now(), volume: 0 }
  doc.volume = workoutVolume(doc)
  const prs = findPRs(doc, workouts)
  if (prs.length) doc.prs = prs
  return { workout: doc, prs }
}

/**
 * 预填：找到最近一次做这个动作的组数安排，作为本组起点（openGym 的“重量自动带出”）。
 * 完整复制组字段（有氧的分/速/坡、计时的秒、RIR），只重置完成与热身标记。
 * @param {string} exId
 * @param {(import('./types.js').Workout|null)[]} [workouts]
 * @returns {import('./types.js').SetEntry[]}
 */
export function prefillFor(exId, workouts) {
  for (const w of workouts || []) {
    if (!w) continue
    const e = (w.entries || []).find(x => x?.exId === exId)
    if (e && e.sets && e.sets.length) {
      return e.sets.slice(0, 8).map(s => ({ ...s, done: false, w: undefined, rir: undefined }))
    }
  }
  return [{ reps: 10, kg: 0, done: false }]
}

/**
 * 编辑/补记后重算一份训练文档：剔未完成组、重算容量、对照其余历史重判 PR。
 * openGym 的「记录会从修正后的历史重新读出」。
 * @param {import('./types.js').Workout} doc
 * @param {(import('./types.js').Workout|null)[]} [others] 不含本文档的其余训练
 * @returns {import('./types.js').Workout}
 */
export function withStats(doc, others) {
  const clean = {
    ...doc,
    entries: (doc.entries || [])
      .map(e => ({
        ...e,
        plannedSets: Math.max(e.plannedSets || 0, (e.sets || []).filter(s => !s.w).length),
        sets: (e.sets || []).filter(s => s.done),
      }))
      .filter(e => e.sets.length > 0),
  }
  clean.volume = workoutVolume(clean)
  const prs = findPRs(clean, others || [])
  if (prs.length) clean.prs = prs
  else delete clean.prs
  return clean
}

/** 按发生顺序重算所有派生统计，编辑或删除早期记录后不会留下过期 PR。
 * @param {import('./types.js').Workout[]} workouts
 * @returns {import('./types.js').Workout[]}
 */
export function rebuildStats(workouts) {
  /** @type {Map<string, number>} */
  const best = new Map()
  const sorted = [...workouts].sort(
    (a, b) => (a.start || 0) - (b.start || 0) || String(a.id).localeCompare(String(b.id))
  )
  const result = sorted.map(w => {
    const entries = (w.entries || []).map(e => ({
      ...e,
      plannedSets: Math.max(e.plannedSets || 0, (e.sets || []).filter(s => !s.w).length),
      sets: (e.sets || []).filter(s => s.done),
    }))
    /** @type {import('./types.js').PRItem[]} */
    const prs = []
    for (const e of entries) {
      if (e.type === 'time' || e.type === 'cardio') continue
      const value = best1RM(e.sets)
      const previous = best.get(e.exId) || 0
      if (previous > 0 && value > previous)
        prs.push({ exId: e.exId, name: e.name, e1rm: Math.round(value * 10) / 10 })
      if (value > previous) best.set(e.exId, value)
    }
    const doc = { ...w, entries, volume: workoutVolume({ ...w, entries }) }
    if (prs.length) doc.prs = prs
    else delete doc.prs
    return doc
  })
  return result.reverse()
}
