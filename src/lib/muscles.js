/* 肌肉图的数据层：区域权重、负荷、三种查看模式的着色等级。
 * 架构照 openGym 的 lib/muscles.js 简化：主发 1.0 / 辅发 0.4 权重，
 * 色阶 0–4 与训练热力图同一套绿。 */

import REGIONS from '../data/exercise-regions.js'

/* 可着色肌群，头到脚顺序（与 body-paths.json 的分区一致） */
export const MUSCLES = [
  'trapezius', 'deltoids', 'chest', 'upper-back', 'serratus',
  'biceps', 'triceps', 'forearm',
  'abs', 'obliques', 'lower-back',
  'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors',
  'calves', 'tibialis',
]

/* 只画轮廓不上色的部分 */
export const INERT = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles']

export const MUSCLE_ZH = {
  trapezius: '斜方肌', deltoids: '肩部', chest: '胸', 'upper-back': '上背',
  serratus: '前锯肌', biceps: '肱二头', triceps: '肱三头', forearm: '前臂',
  abs: '腹肌', obliques: '腹斜肌', 'lower-back': '下背', gluteal: '臀',
  quadriceps: '股四头', hamstring: '腘绳肌', adductors: '内收肌',
  'hip-flexors': '髂腰肌', calves: '小腿', tibialis: '胫前肌',
}

/* 自定义动作只有粗肌群 m —— 按此回退分布（权重和为 1） */
const COARSE = {
  胸: { chest: 1 },
  背: { 'upper-back': 0.7, 'lower-back': 0.3 },
  肩: { deltoids: 1 },
  手臂: { biceps: 0.5, triceps: 0.5 },
  腿: { quadriceps: 0.4, hamstring: 0.35, gluteal: 0.25 },
  臀: { gluteal: 1 },
  核心: { abs: 0.7, obliques: 0.3 },
  有氧: {},
}

const SECONDARY = 0.4

/* 一个动作对各区域的刺激权重。ex 传 { id, m }（条目或动作对象都行）。 */
export function weightsOf(ex) {
  if (!ex) return {}
  const note = REGIONS[ex.id]
  if (note) {
    const out = {}
    note.p.forEach(slug => { if (MUSCLES.includes(slug)) out[slug] = 1 })
    note.s.forEach(slug => { if (MUSCLES.includes(slug)) out[slug] = Math.max(out[slug] || 0, SECONDARY) })
    if (Object.keys(out).length) return out
  }
  return COARSE[ex.m] || {}
}

/* 有效组数负荷：近 windowDays 天内，完成组（非热身）按主/辅权重累加。 */
export function regionLoad(workouts, windowDays = 7, now = Date.now()) {
  const cutoff = now - windowDays * 86400000
  const load = {}
  for (const w of workouts || []) {
    if (!w || !w.start || w.start < cutoff) continue
    for (const e of w.entries || []) {
      if (!e) continue
      const weights = weightsOf({ id: e.exId, m: e.m })
      const sets = (e.sets || []).filter(s => s?.done && !s.w).length
      if (!sets) continue
      for (const slug in weights) load[slug] = (load[slug] || 0) + weights[slug] * sets
    }
  }
  return load
}

/* 容量等级：相对同期最强肌群，0–4 档（openGym 的相对算法） */
export function volumeLevels(load) {
  const max = Math.max(0, ...MUSCLES.map(m => load[m] || 0))
  const lv = {}
  MUSCLES.forEach(m => {
    const v = load[m] || 0
    lv[m] = !v || max <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((v / max) * 4)))
  })
  return lv
}

/* 各区域恢复需求（小时）：大肌群 72 / 中 48 / 小 36 */
const NEED_H = {
  chest: 72, 'upper-back': 72, 'lower-back': 72, quadriceps: 72, hamstring: 72, gluteal: 72,
  trapezius: 48, deltoids: 48, biceps: 48, triceps: 48, abs: 48,
  forearm: 36, obliques: 36, adductors: 36, 'hip-flexors': 36, calves: 36, tibialis: 36, serratus: 36,
}

function lastTouch(workouts, now) {
  // 每个区域最近一次被练到的时间
  const last = {}
  for (const w of workouts || []) {
    if (!w || !w.start) continue
    for (const e of w.entries || []) {
      if (!e) continue
      const weights = weightsOf({ id: e.exId, m: e.m })
      const sets = (e.sets || []).filter(s => s?.done && !s.w).length
      if (!sets) continue
      for (const slug in weights) last[slug] = Math.max(last[slug] || 0, w.start)
    }
  }
  void now
  return last
}

/* 恢复等级：恢复进度越高越亮（0=刚练完还在恢复，4=已恢复可再练） */
export function recoveryLevels(workouts, now = Date.now()) {
  const last = lastTouch(workouts, now)
  const lv = {}
  MUSCLES.forEach(slug => {
    const need = NEED_H[slug] || 48
    const hours = last[slug] ? (now - last[slug]) / 3600000 : need
    const pct = Math.min(100, (hours / need) * 100)
    lv[slug] = Math.min(4, Math.floor(pct / 20.0001))
  })
  return lv
}

/* 盲区等级：越久没练越亮（0=3 天内练过 … 4=超过 21 天或从没练过） */
export function neglectedLevels(workouts, now = Date.now()) {
  const last = lastTouch(workouts, now)
  const lv = {}
  MUSCLES.forEach(slug => {
    if (!last[slug]) { lv[slug] = 4; return }
    const days = (now - last[slug]) / 86400000
    lv[slug] = days <= 3 ? 0 : days <= 7 ? 1 : days <= 14 ? 2 : days <= 21 ? 3 : 4
  })
  return lv
}
