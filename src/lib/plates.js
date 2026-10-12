/* 杠铃配重计算：给定目标重量、杆重和拥有的片规格，贪心算出每边挂法。 */

export const STANDARD_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]

export function platesFor(kg, bar = 20, avail = STANDARD_PLATES) {
  const side = (kg - bar) / 2
  if (!(side > 0)) return { perSide: [], leftover: 0, tooLight: side < 0 }
  let rem = Math.round(side * 100) / 100
  const perSide = []
  for (const p of [...avail].sort((a, b) => b - a)) {
    const n = Math.floor(Math.round((rem / p) * 100) / 100)
    for (let i = 0; i < n; i++) perSide.push(p)
    rem = Math.round((rem - n * p) * 100) / 100
    if (rem <= 0) break
  }
  return { perSide, leftover: rem > 0 ? rem : 0, tooLight: false }
}

export const fmtPlates = perSide => perSide.join(' + ') || '空杆'
