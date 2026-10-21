import { validSet } from './sets.js'
import { localDate } from './dates.js'
import { entryVolume } from './workout.js'

export function entrySummary(entry) {
  const sets = (entry?.sets || []).filter(s => s.done && !s.w && validSet(s, entry?.type))
  if (entry?.type === 'time')
    return { sets: sets.length, value: sets.reduce((n, s) => n + (s.sec ?? s.kg ?? 0), 0), unit: '秒' }
  if (entry?.type === 'cardio')
    return { sets: sets.length, value: sets.reduce((n, s) => n + (s.min || 0), 0), unit: '分钟' }
  return { sets: sets.length, value: entryVolume(entry || { sets: [] }), unit: 'kg 容量' }
}

export function compareEntry(entry, history, before) {
  const workout = [...history]
    .filter(w => w.start < before && w.entries.some(e => e.exId === entry.exId))
    .sort((a, b) => b.start - a.start)[0]
  const previous = workout?.entries.find(e => e.exId === entry.exId)
  if (!previous || (previous.type || 'reps') !== (entry.type || 'reps')) return null
  const current = entrySummary(entry),
    prior = entrySummary(previous)
  return { current, prior, date: workout.d || localDate(workout.start), delta: current.value - prior.value }
}

export function weeklyReview(history, now = new Date(), offset = 0) {
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7)
  const end = new Date(monday)
  end.setDate(end.getDate() + 7)
  const previous = new Date(monday)
  previous.setDate(previous.getDate() - 7)
  // 本周与上周同一星期/时刻比较，历史周则比较完整七天。
  const until = offset === 0 ? new Date(now) : end
  const priorUntil = new Date(until)
  priorUntil.setDate(priorUntil.getDate() - 7)
  const summarize = (from, to) => {
    const workouts = history.filter(
      w =>
        w.start >= +from &&
        w.start < +to &&
        w.start <= +now &&
        w.entries.some(e => (e.sets || []).some(s => s.done && validSet(s, e.type)))
    )
    return {
      sessions: workouts.length,
      days: new Set(workouts.map(w => localDate(w.start))).size,
      sets: workouts.reduce((n, w) => n + w.entries.reduce((m, e) => m + entrySummary(e).sets, 0), 0),
      volume: workouts.reduce((n, w) => n + w.entries.reduce((m, e) => m + entryVolume(e), 0), 0),
      minutes: Math.round(
        workouts.reduce((n, w) => n + Math.max(0, (w.end || w.start) - w.start), 0) / 60000
      ),
      timedSeconds: workouts.reduce(
        (n, w) => n + w.entries.filter(e => e.type === 'time').reduce((m, e) => m + entrySummary(e).value, 0),
        0
      ),
      cardioMinutes: workouts.reduce(
        (n, w) =>
          n + w.entries.filter(e => e.type === 'cardio').reduce((m, e) => m + entrySummary(e).value, 0),
        0
      ),
      prs: workouts.reduce((n, w) => n + (w.prs?.length || 0), 0),
    }
  }
  return {
    from: localDate(monday),
    to: localDate(new Date(+end - 1)),
    current: summarize(monday, until),
    previous: summarize(previous, priorUntil),
  }
}
