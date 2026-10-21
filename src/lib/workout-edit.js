import { localDate } from './dates.js'

// 只改名称或组时不改变时间；改日期时保留钟点和原始时长。
export function editedWorkoutTimes(workout, dateStr) {
  if (!Number.isFinite(workout?.start)) {
    const start = +new Date(dateStr + 'T12:00:00')
    return { start, end: start + 3600000 }
  }
  const startDate = new Date(workout.start)
  if (localDate(startDate) !== dateStr) {
    const day = new Date(dateStr + 'T12:00:00')
    startDate.setFullYear(day.getFullYear(), day.getMonth(), day.getDate())
  }
  const start = +startDate
  const duration = Number.isFinite(workout.end) ? Math.max(0, workout.end - workout.start) : 0
  return { start, end: start + duration }
}
