/* 估算 1RM（Epley 公式）：w * (1 + reps / 30)。单次 = 自身重量。
 * 热身组（w 标记）不计入 PR/1RM。 */
// @ts-check

/** @param {number} kg @param {number} reps @returns {number} */
export const epley = (kg, reps) => (reps <= 1 ? kg : kg * (1 + reps / 30))

/**
 * 一份完成组里的最高估计 1RM（热身组与未完成组跳过）；没有合格组返回 0。
 * @param {import('./types.js').SetEntry[]} [sets]
 * @returns {number}
 */
export function best1RM(sets) {
  let m = 0
  for (const s of sets || []) {
    if (!s.done || s.w) continue
    const kg = s.kg ?? 0
    const reps = s.reps ?? 0
    if (!(kg > 0) || !(reps > 0)) continue
    m = Math.max(m, epley(kg, reps))
  }
  return m
}
