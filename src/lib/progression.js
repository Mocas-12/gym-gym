/* 渐进规则引擎 —— 纯函数。决定「下次这个动作举多重、做几次」，并给出理由。
 *
 * 线性（linear）：全组达到目标次数 → 加重；未全中 → 重量不变；连续两次未全中 → 减载。
 * 双进程（double）：次数区间 [min,max]。全到 max → 加重且次数回到 min；有组不足 min → 减载；
 *                  否则重量不变、次数往上推。
 * 与 openGym 相同的两条铁律：没做满绝不加重；停滞触发减载而不是硬顶。
 */

export const SCHEMES = [
  { id: 'none', name: '不加重' },
  { id: 'linear', name: '线性' },
  { id: 'double', name: '双进程' },
  { id: 'greyskull', name: 'Greyskull' },
  { id: 'triple', name: '三进程' },
  { id: 'time', name: '计时递增' },
]

export const DEFAULT_CFG = () => ({ scheme: 'double', inc: 2.5, reps: 8, min: 6, max: 10, bonusInc: 2.5, sets: 3, setsMax: 5, incSec: 5, targetSec: 45, maxSec: 120 })

export const round05 = v => Math.round(v * 2) / 2
export const deloadKg = (kg, pct = 0.1) => round05(kg * (1 - pct))

/* 该动作最近 n 次训练的完成组（workouts 新的在前）。只看有重量的完成组。
 * 计时类（scheme=time）的组 reps 为 null，同样放行。 */
export function sessionsOf(workouts, exId, n = 2) {
  const out = []
  for (const w of workouts || []) {
    if (!w) continue
    const e = (w.entries || []).find(x => x?.exId === exId)
    const sets = e ? (e.sets || []).filter(s => s.done && s.kg > 0 && (s.reps > 0 || s.reps == null)) : null
    if (sets && sets.length) { out.push(sets); if (out.length >= n) break }
  }
  return out
}

/* 下一目标：{ kg, reps, note, sets? }；无历史返回 null（交给 prefillFor 用上次的组）。
 * sets 仅三进程等需要变化组数的方案返回。 */
export function nextTarget(cfg, workouts, exId) {
  if (!cfg || cfg.scheme === 'none' || !exId) return null
  const [last, prev] = sessionsOf(workouts, exId, 2)
  if (!last) return null
  const kg = last[0].kg

  if (cfg.scheme === 'linear') {
    const reps = cfg.reps
    if (last.every(s => s.reps >= reps)) {
      return { kg: round05(kg + cfg.inc), reps, note: `上次 ${last.length} 组全部 ≥${reps} 次 → 加重 ${cfg.inc}kg` }
    }
    if (prev && !prev.every(s => s.reps >= reps)) {
      const d = deloadKg(kg)
      return { kg: d, reps, note: `连续两次没做满 ${reps} 次 → 减载到 ${d}kg` }
    }
    return { kg, reps, note: `上次没做满 ${reps} 次 → 重量不变，先补齐次数` }
  }

  if (cfg.scheme === 'greyskull') {
    // Greyskull LP：目标次数全部达成 → 加重；最后一组冲得猛（≥目标+2）→ 双倍加重；连续未达 → 减载
    const reps = cfg.reps
    if (last.every(s => s.reps >= reps)) {
      const lastSet = last[last.length - 1].reps
      if (lastSet >= reps + 2) {
        const up = round05(kg + cfg.inc + (cfg.bonusInc || cfg.inc))
        return { kg: up, reps, note: `全中且最后一组冲到 ${lastSet} 次 → 双倍加重到 ${up}kg` }
      }
      return { kg: round05(kg + cfg.inc), reps, note: `全部 ≥${reps} 次 → 加重 ${cfg.inc}kg` }
    }
    if (prev && !prev.every(s => s.reps >= reps)) {
      const d = deloadKg(kg)
      return { kg: d, reps, note: `连续两次没做满 → 减载到 ${d}kg` }
    }
    return { kg, reps, note: `没做满 ${reps} 次 → 重量不变` }
  }

  if (cfg.scheme === 'triple') {
    // 三进程：次数 → 组数 → 重量。次数顶满加一组；组数加满顶次数 → 加重回下限
    const { min, max, inc } = cfg
    const setsTarget = cfg.sets || 3
    const setsMax = cfg.setsMax || 5
    const n = last.length
    const allMax = last.every(s => s.reps >= max)
    const anyMin = last.some(s => s.reps < min)
    if (allMax && n < setsMax) {
      return { kg, reps: max, sets: n + 1, note: `全部 ≥${max} 次 → 加一组（第 ${n + 1} 组）` }
    }
    if (allMax && n >= setsMax) {
      return { kg: round05(kg + inc), reps: min, sets: setsTarget, note: `组数加满仍全中 → 加重 ${inc}kg，回到 ${setsTarget} 组 × ${min} 次` }
    }
    if (anyMin) {
      const d = deloadKg(kg)
      return { kg: d, reps: min, sets: setsTarget, note: `有组不足 ${min} 次 → 减载到 ${d}kg` }
    }
    const push = Math.min(max, Math.max(...last.map(s => s.reps)) + 1)
    return { kg, reps: push, sets: n, note: `重量不变 → 次数往 ${max} 推，这次目标 ${push}` }
  }

  if (cfg.scheme === 'time') {
    // 计时递增（平板支撑等）：秒数存在 kg 字段。全部达标 → 目标时间 +incSec
    const target = cfg.targetSec || 45
    const incSec = cfg.incSec || 5
    const maxSec = cfg.maxSec || 120
    if (last.every(s => s.kg >= target)) {
      if (target >= maxSec) return { kg: target, reps: null, note: `已到上限 ${maxSec} 秒，保持` }
      const t = Math.min(maxSec, target + incSec)
      return { kg: t, reps: null, note: `上次全部 ≥${target} 秒 → 目标加到 ${t} 秒` }
    }
    return { kg: target, reps: null, note: `没做满 ${target} 秒 → 目标不变，先补齐` }
  }

  // double progression
  const { min, max, inc } = cfg
  if (last.every(s => s.reps >= max)) {
    return { kg: round05(kg + inc), reps: min, note: `上次全部 ≥${max} 次 → 加重 ${inc}kg，次数回到 ${min}` }
  }
  if (last.some(s => s.reps < min)) {
    const d = deloadKg(kg)
    return { kg: d, reps: min, note: `有组不足 ${min} 次 → 减载到 ${d}kg` }
  }
  const push = Math.min(max, Math.max(...last.map(s => s.reps)) + 1)
  return { kg, reps: push, note: `重量不变 → 次数往 ${max} 推，这次目标 ${push}` }
}
