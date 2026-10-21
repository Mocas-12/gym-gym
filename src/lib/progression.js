/* 渐进规则引擎 —— 纯函数。决定「下次这个动作举多重、做几次」，并给出理由。
 *
 * 线性（linear）：全组达到目标次数 → 加重；未全中 → 重量不变；连续两次未全中 → 减载。
 * 双进程（double）：次数区间 [min,max]。全到 max → 加重且次数回到 min；有组不足 min → 减载；
 *                  否则重量不变、次数往上推。
 * 与 openGym 相同的两条铁律：没做满绝不加重；停滞触发减载而不是硬顶。
 */
// @ts-check
import { boundedSetCount } from './sets.js'

/** @type {{ id: string, name: string }[]} */
export const SCHEMES = [
  { id: 'none', name: '不加重' },
  { id: 'linear', name: '线性' },
  { id: 'double', name: '双进程' },
  { id: 'greyskull', name: 'Greyskull' },
  { id: 'triple', name: '三进程' },
  { id: 'time', name: '计时递增' },
]

/** @returns {Required<import('./types.js').ProgressionCfg>} */
export const DEFAULT_CFG = () => ({
  scheme: 'double',
  inc: 2.5,
  reps: 8,
  min: 6,
  max: 10,
  bonusInc: 2.5,
  sets: 3,
  setsMax: 5,
  incSec: 5,
  targetSec: 45,
  maxSec: 120,
})

/** 取 0.5kg 步长最近值 @param {number} v @returns {number} */
export const round05 = v => Math.round(v * 2) / 2
/** 按 pct 比例减载（默认 -10%）并取 0.5kg 步长 @param {number} kg @param {number} [pct] @returns {number} */
export const deloadKg = (kg, pct = 0.1) => round05(kg * (1 - pct))

/** @param {import('./types.js').SetEntry} s @returns {boolean} */
const eligible = s =>
  !!s.done && !s.w && (((s.kg ?? 0) > 0 && ((s.reps ?? 0) > 0 || s.reps == null)) || (s.sec ?? 0) > 0)

/**
 * 该动作最近 n 次训练的完成组（workouts 新的在前）。
 * 力量：kg×reps 都要有；计时类（sec 字段）有秒即可。
 * @param {(import('./types.js').Workout|null)[]} workouts
 * @param {string} exId
 * @param {number} [n]
 * @returns {import('./types.js').SetEntry[][]}
 */
export function sessionsOf(workouts, exId, n = 2) {
  /** @type {import('./types.js').SetEntry[][]} */
  const out = []
  for (const w of workouts || []) {
    if (!w) continue
    const e = (w.entries || []).find(x => x?.exId === exId)
    const sets = e ? (e.sets || []).filter(eligible) : null
    if (sets && sets.length) {
      out.push(sets)
      if (out.length >= n) break
    }
  }
  return out
}

/**
 * 下一目标：{ kg, reps, note, sets? }；无历史返回 null（交给 prefillFor 用上次的组）。
 * sets 仅三进程等需要变化组数的方案返回；sec 仅计时类返回。
 * @param {import('./types.js').ProgressionCfg|null} cfg
 * @param {(import('./types.js').Workout|null)[]} workouts
 * @param {string} [exId]
 * @returns {import('./types.js').NextTarget|null}
 */
export function nextTarget(cfg, workouts, exId) {
  if (!cfg || cfg.scheme === 'none' || !exId) return null
  const [last, prev] = sessionsOf(workouts, exId, 2)
  if (!last) return null
  const entry = (workouts || [])
    .flatMap(w => w?.entries || [])
    .find(e => e.exId === exId && e.sets?.some(eligible))
  const planned = boundedSetCount(
    Math.max(entry?.plannedSets || 0, (entry?.sets || []).filter(s => !s.w).length, last.length)
  )
  // 进 schemes 运算前按「字段必有」处理：sessionsOf 已过滤有效组，cfg 由 DEFAULT_CFG 补全
  const kg = /** @type {number} */ (last[0].kg)
  /** 完成组的 reps 缺失视为 0（比较用，不参与展示） @param {import('./types.js').SetEntry} s @returns {number} */
  const repsOf = s => /** @type {number} */ (s.reps)

  if (cfg.scheme !== 'time') {
    if (!Number.isFinite(kg) || !last.every(s => Number.isFinite(s.reps))) return null
    if (last.length < planned)
      return {
        kg,
        reps: Math.max(...last.map(repsOf)),
        sets: planned,
        note: `上次仅完成 ${last.length}/${planned} 组 → 重量不变，先完成原计划`,
      }
  }

  if (cfg.scheme === 'linear') {
    const reps = /** @type {number} */ (cfg.reps)
    if (last.every(s => repsOf(s) >= reps)) {
      return {
        kg: round05(kg + /** @type {number} */ (cfg.inc)),
        reps,
        note: `上次 ${last.length} 组全部 ≥${reps} 次 → 加重 ${cfg.inc}kg`,
      }
    }
    if (prev && !prev.every(s => repsOf(s) >= reps)) {
      const d = deloadKg(kg)
      return { kg: d, reps, note: `连续两次没做满 ${reps} 次 → 减载到 ${d}kg` }
    }
    return { kg, reps, note: `上次没做满 ${reps} 次 → 重量不变，先补齐次数` }
  }

  if (cfg.scheme === 'greyskull') {
    // Greyskull LP：目标次数全部达成 → 加重；最后一组冲得猛（≥目标+2）→ 双倍加重；连续未达 → 减载
    const reps = /** @type {number} */ (cfg.reps)
    if (last.every(s => repsOf(s) >= reps)) {
      const lastSet = repsOf(last[last.length - 1])
      if (lastSet >= reps + 2) {
        const up = round05(
          kg + /** @type {number} */ (cfg.inc) + /** @type {number} */ (cfg.bonusInc || cfg.inc)
        )
        return { kg: up, reps, note: `全中且最后一组冲到 ${lastSet} 次 → 双倍加重到 ${up}kg` }
      }
      return {
        kg: round05(kg + /** @type {number} */ (cfg.inc)),
        reps,
        note: `全部 ≥${reps} 次 → 加重 ${cfg.inc}kg`,
      }
    }
    if (prev && !prev.every(s => repsOf(s) >= reps)) {
      const d = deloadKg(kg)
      return { kg: d, reps, note: `连续两次没做满 → 减载到 ${d}kg` }
    }
    return { kg, reps, note: `没做满 ${reps} 次 → 重量不变` }
  }

  if (cfg.scheme === 'triple') {
    // 三进程：次数 → 组数 → 重量。次数顶满加一组；组数加满顶次数 → 加重回下限
    const min = /** @type {number} */ (cfg.min)
    const max = /** @type {number} */ (cfg.max)
    const inc = /** @type {number} */ (cfg.inc)
    const setsTarget = boundedSetCount(cfg.sets)
    const setsMax = Math.max(setsTarget, boundedSetCount(cfg.setsMax, 5))
    const n = last.length
    const allMax = last.every(s => repsOf(s) >= max)
    const anyMin = last.some(s => repsOf(s) < min)
    if (allMax && n < setsMax) {
      return { kg, reps: max, sets: n + 1, note: `全部 ≥${max} 次 → 加一组（第 ${n + 1} 组）` }
    }
    if (allMax && n >= setsMax) {
      return {
        kg: round05(kg + inc),
        reps: min,
        sets: setsTarget,
        note: `组数加满仍全中 → 加重 ${inc}kg，回到 ${setsTarget} 组 × ${min} 次`,
      }
    }
    if (anyMin) {
      const d = deloadKg(kg)
      return { kg: d, reps: min, sets: setsTarget, note: `有组不足 ${min} 次 → 减载到 ${d}kg` }
    }
    const push = Math.min(max, Math.max(...last.map(repsOf)) + 1)
    return { kg, reps: push, sets: n, note: `重量不变 → 次数往 ${max} 推，这次目标 ${push}` }
  }

  if (cfg.scheme === 'time') {
    // 计时递增（平板支撑等）：秒数存在 sec 字段（旧数据在 kg）。全部达标 → 目标时间 +incSec
    const incSec = cfg.incSec || 5
    const maxSec = cfg.maxSec || 120
    /** @param {import('./types.js').SetEntry} s @returns {number} */
    const secsOf = s => s.sec ?? s.kg ?? 0
    const target = Math.min(
      maxSec,
      Math.max(cfg.targetSec || 45, entry?.targetSec || Math.min(...last.map(secsOf)))
    )
    if (last.length >= planned && last.every(s => secsOf(s) >= target)) {
      if (target >= maxSec)
        return { kg: target, sec: target, reps: null, note: `已到上限 ${maxSec} 秒，保持` }
      const t = Math.min(maxSec, target + incSec)
      return { kg: t, sec: t, reps: null, sets: planned, note: `上次全部 ≥${target} 秒 → 目标加到 ${t} 秒` }
    }
    return {
      kg: target,
      sec: target,
      reps: null,
      sets: planned,
      note: `没做满 ${planned} 组 × ${target} 秒 → 目标不变，先补齐`,
    }
  }

  // double progression
  const min = /** @type {number} */ (cfg.min)
  const max = /** @type {number} */ (cfg.max)
  const inc = /** @type {number} */ (cfg.inc)
  if (last.every(s => repsOf(s) >= max)) {
    return { kg: round05(kg + inc), reps: min, note: `上次全部 ≥${max} 次 → 加重 ${inc}kg，次数回到 ${min}` }
  }
  if (last.some(s => repsOf(s) < min)) {
    const d = deloadKg(kg)
    return { kg: d, reps: min, note: `有组不足 ${min} 次 → 减载到 ${d}kg` }
  }
  const push = Math.min(max, Math.max(...last.map(repsOf)) + 1)
  return { kg, reps: push, note: `重量不变 → 次数往 ${max} 推，这次目标 ${push}` }
}
