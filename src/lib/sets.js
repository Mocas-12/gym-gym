// @ts-check
export const MAX_SETS = 50

/** @param {any} value @param {number} [fallback] @returns {number} */
export function boundedSetCount(value, fallback = 3) {
  const n = Number.isFinite(value) && value > 0 ? value : fallback
  return Math.min(MAX_SETS, Math.max(1, Math.floor(Number.isFinite(n) ? n : 3)))
}

/** @param {import('./types.js').SetEntry} set @param {string} [type] @returns {boolean} */
export function validSet(set, type = 'reps') {
  if (type === 'time') {
    const sec = set.sec ?? set.kg
    return Number.isFinite(sec) && /** @type {number} */ (sec) > 0
  }
  if (type === 'cardio')
    return (
      Number.isFinite(set.min) &&
      /** @type {number} */ (set.min) > 0 &&
      [set.speed, set.incl].every(value => value == null || (Number.isFinite(value) && value >= 0))
    )
  return (
    Number.isFinite(set.kg) &&
    /** @type {number} */ (set.kg) >= 0 &&
    Number.isInteger(set.reps) &&
    /** @type {number} */ (set.reps) > 0
  )
}
