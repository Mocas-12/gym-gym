/* 估算 1RM（Epley 公式）：w * (1 + reps / 30)。单次 = 自身重量。 */
export const epley = (kg, reps) => (reps <= 1 ? kg : kg * (1 + reps / 30))

export function best1RM(sets) {
  let m = 0
  for (const s of sets || []) {
    if (!s.done || !(s.kg > 0) || !(s.reps > 0)) continue
    m = Math.max(m, epley(s.kg, s.reps))
  }
  return m
}
