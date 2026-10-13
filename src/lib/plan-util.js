// @ts-check

/** @returns {string} YYYY-MM-DD */
export const todayISO = () => new Date().toISOString().slice(0, 10)
