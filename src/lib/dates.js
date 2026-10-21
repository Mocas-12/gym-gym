// @ts-check

/** 本地日历日，不把凌晨的记录换算到 UTC。
 * @param {number|Date} [value]
 * @returns {string}
 */
export function localDate(value = Date.now()) {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** @param {number} value @param {number} [now] @returns {boolean} */
export function isThisMonth(value, now = Date.now()) {
  const d = new Date(value)
  const current = new Date(now)
  return d.getFullYear() === current.getFullYear() && d.getMonth() === current.getMonth()
}
