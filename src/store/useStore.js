/* 单一 Zustand store 持有全部数据，localStorage 持久化（openGym 的简化版）。
 * 训练中会话放在 active 里：刷新/杀进程后恢复，finish 后归档进 workouts。 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { EXERCISES } from '../data/exercises.js'
import { PRESET_ROUTINES } from '../data/routines.js'
import { finalizeWorkout, prefillFor } from '../lib/workout.js'

const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 11)
const today = () => new Date().toISOString().slice(0, 10)

export const useStore = create(
  persist(
    (set, get) => ({
      settings: { restSec: 90, sound: true, vibrate: true },
      customEx: [],          // 用户自建练习
      routines: PRESET_ROUTINES,
      workouts: [],          // {id, d, name, start, end, entries, volume, prs}
      bodyweight: [],        // {d, t, kg}
      active: null,          // 进行中的训练，结构同 workouts 条目

      /* ---- 训练 ---- */
      startWorkout(name = '自由训练', entryIds = []) {
        const entries = entryIds.map(id => {
          const ex = get().allEx().find(e => e.id === id)
          return { exId: id, name: ex?.n || id, restSec: ex?.rest, sets: prefillFor(id, get().workouts) }
        })
        set({ active: { id: uid(), d: today(), name, start: Date.now(), entries } })
      },
      addEntry(exId) {
        const a = get().active
        if (!a || a.entries.some(e => e.exId === exId)) return false
        const ex = get().allEx().find(e => e.id === exId)
        set({ active: { ...a, entries: [...a.entries, { exId, name: ex?.n || exId, restSec: ex?.rest, sets: prefillFor(exId, get().workouts) }] } })
        return true
      },
      removeEntry(exId) {
        const a = get().active
        if (!a) return
        set({ active: { ...a, entries: a.entries.filter(e => e.exId !== exId) } })
      },
      addSet(exId, copyPrev = true) {
        const a = get().active
        if (!a) return
        set({
          active: {
            ...a,
            entries: a.entries.map(e => {
              if (e.exId !== exId) return e
              const prev = e.sets[e.sets.length - 1]
              const s = copyPrev && prev ? { ...prev, done: false } : { reps: prev?.reps ?? 10, kg: prev?.kg ?? 0, done: false }
              return { ...e, sets: [...e.sets, s] }
            }),
          },
        })
      },
      updateSet(exId, i, patch) {
        const a = get().active
        if (!a) return
        set({
          active: {
            ...a,
            entries: a.entries.map(e =>
              e.exId !== exId ? e : { ...e, sets: e.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) }
            ),
          },
        })
      },
      toggleDone(exId, i) {
        const a = get().active
        const e = a?.entries.find(x => x.exId === exId)
        const s = e?.sets[i]
        if (!s) return null
        const nowDone = !s.done
        get().updateSet(exId, i, { done: nowDone })
        return nowDone ? (e.restSec ?? get().settings.restSec) : null // 完成 → 返回应休息秒数
      },
      deleteSet(exId, i) {
        const a = get().active
        if (!a) return
        set({
          active: {
            ...a,
            entries: a.entries.map(e => (e.exId !== exId ? e : { ...e, sets: e.sets.filter((_, j) => j !== i) })),
          },
        })
      },
      finishWorkout() {
        const { active, workouts } = get()
        if (!active) return null
        const { workout } = finalizeWorkout(active, workouts)
        set({ workouts: [workout, ...workouts], active: null })
        return workout
      },
      discardWorkout() { set({ active: null }) },
      deleteWorkout(id) { set({ workouts: get().workouts.filter(w => w.id !== id) }) },

      /* ---- 数据 ---- */
      logBodyweight(kg) {
        const d = today()
        const rest = get().bodyweight.filter(e => e.d !== d)
        set({ bodyweight: [{ d, t: Date.now(), kg }, ...rest].sort((a, b) => b.t - a.t) })
      },
      addCustomEx({ n, m, eq, type }) {
        const ex = { id: 'c' + uid(), n, m, eq: eq || '自重', type: type || 'reps', custom: true }
        set({ customEx: [ex, ...get().customEx] })
        return ex
      },
      setSettings(patch) { set({ settings: { ...get().settings, ...patch } }) },
      exportState() {
        const { settings, customEx, routines, workouts, bodyweight, active } = get()
        return JSON.stringify({ app: 'gym-gym', version: 1, exportedAt: new Date().toISOString(), settings, customEx, routines, workouts, bodyweight, active }, null, 2)
      },
      importState(json) {
        const d = JSON.parse(json)
        if (d.app !== 'gym-gym') throw new Error('不是 gym-gym 的备份文件')
        set({
          settings: { ...get().settings, ...d.settings },
          customEx: Array.isArray(d.customEx) ? d.customEx : [],
          workouts: Array.isArray(d.workouts) ? d.workouts : [],
          bodyweight: Array.isArray(d.bodyweight) ? d.bodyweight : [],
          active: d.active || null,
        })
      },
      resetAll() { set({ settings: { restSec: 90, sound: true, vibrate: true }, customEx: [], routines: PRESET_ROUTINES, workouts: [], bodyweight: [], active: null }) },

      /* ---- 派生 ---- */
      allEx() { return [...EXERCISES, ...get().customEx] },
    }),
    {
      name: 'gym_gym_v1',
      version: 1,
      partialize: s => ({
        settings: s.settings, customEx: s.customEx, routines: s.routines,
        workouts: s.workouts, bodyweight: s.bodyweight, active: s.active,
      }),
    }
  )
)
