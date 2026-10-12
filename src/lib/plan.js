/* 周计划：week 模式按星期几排课；rotation 模式按顺序轮换（下一个=上一次做的下一个）。
 * week 的键是 JS getDay()：0=周日 … 6=周六。 */
import { todayISO } from './plan-util.js'

export function todayPlan(plan, workouts) {
  if (!plan) return null
  if (plan.mode === 'rotation') return rotationNext(plan.rotation, workouts)
  return plan.week?.[new Date().getDay()] || null
}

/* 轮换：找到最近一次训练的 rid 在轮换表里的位置，下一个就是它的下一位（循环）。 */
export function rotationNext(rotation, workouts) {
  if (!rotation || !rotation.length) return null
  let lastIdx = -1
  for (const w of workouts || []) {
    if (!w) continue
    const i = rotation.indexOf(w.rid)
    if (i >= 0) { lastIdx = i; break }
  }
  return rotation[(lastIdx + 1) % rotation.length]
}

/* 休息日提示：从今天往后找 7 天内第一个排了课的日子。返回 { inDays, rid } 或 null。 */
export function nextAssigned(plan, workouts, from = new Date()) {
  if (!plan || plan.mode !== 'week') {
    const rid = rotationNext(plan?.rotation, workouts)
    return rid ? { inDays: 0, rid } : null
  }
  for (let add = 0; add < 7; add++) {
    const d = new Date(from)
    d.setDate(d.getDate() + add)
    const rid = plan.week?.[d.getDay()]
    if (rid) return { inDays: add, rid }
  }
  return null
}

export const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
/* 计划页显示顺序：周一开始 */
export const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0]

export { todayISO }
