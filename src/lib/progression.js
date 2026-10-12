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
]

export const DEFAULT_CFG = () => ({ scheme: 'double', inc: 2.5, reps: 8, min: 6, max: 10 })

export const round05 = v => Math.round(v * 2) / 2
export const deloadKg = (kg, pct = 0.1) => round05(kg * (1 - pct))

/* 该动作最近 n 次训练的完成组（workouts 新的在前）。只看有重量的完成组。 */
export function sessionsOf(workouts, exId, n = 2) {
  const out = []
  for (const w of workouts || []) {
    if (!w) continue
    const e = (w.entries || []).find(x => x?.exId === exId)
    const sets = e ? (e.sets || []).filter(s => s.done && s.kg > 0 && s.reps > 0) : null
    if (sets && sets.length) { out.push(sets); if (out.length >= n) break }
  }
  return out
}

/* 下一目标：{ kg, reps, note }；无历史返回 null（交给 prefillFor 用上次的组）。 */
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
