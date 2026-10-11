/* 单一 Zustand store 持有全部数据，localStorage 持久化（openGym 的简化版）。
 * 训练中会话放在 active 里：刷新/杀进程后恢复，finish 后归档进 workouts。 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { EXERCISES } from '../data/exercises.js'
import { PRESET_ROUTINES } from '../data/routines.js'
import { finalizeWorkout, prefillFor } from '../lib/workout.js'
import { nextTarget, DEFAULT_CFG } from '../lib/progression.js'

/* getRandomValues 而非 randomUUID：后者在 iOS 15.3- 和非安全上下文（局域网 http 调试）不存在 */
const uid = () => [...crypto.getRandomValues(new Uint8Array(8))].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 11)
const today = () => new Date().toISOString().slice(0, 10)

/* 超级组：routine.supersets 是按相邻行分组的多组数组（如 [['bench','ohp']]）。
 * 组内动作在训练里交替做。编辑器里用「与上一个同组」开关维护。 */
const supIndexOf = (routine, exId) => {
  const i = routine?.supersets?.findIndex(g => g.includes(exId))
  return i >= 0 ? i : null
}

export const useStore = create(
  persist(
    (set, get) => ({
      settings: { restSec: 90, sound: true, vibrate: true },
      customEx: [],          // 用户自建练习
      routines: PRESET_ROUTINES,
      plan: { mode: 'week', week: { 1: 'push', 3: 'pull', 5: 'legs' }, rotation: ['push', 'pull', 'legs'] },
      workouts: [],          // {id, d, name, rid, start, end, entries, volume, prs}
      bodyweight: [],        // {d, t, kg}
      active: null,          // 进行中的训练，结构同 workouts 条目

      /* ---- 训练 ---- */
      /* 从渐进引擎/预填构建该动作的初始组。cfg 来自所从的 routine（null=自由训练只预填）。 */
      buildSets(exId, cfg) {
        const { workouts } = get()
        const t = nextTarget(cfg, workouts, exId)
        if (t) {
          return { sets: [0, 1, 2].map(() => ({ kg: t.kg, reps: t.reps, done: false })), note: t.note }
        }
        return { sets: prefillFor(exId, workouts), note: null }
      },
      startWorkout(name = '自由训练', entryIds = [], rid = null) {
        const routine = rid ? get().routines.find(r => r.id === rid) : null
        const entries = entryIds.map(id => {
          const ex = get().allEx().find(e => e.id === id)
          const { sets, note } = get().buildSets(id, routine?.cfg || null)
          return {
            exId: id, name: ex?.n || id, type: ex?.type || 'reps',
            restSec: ex?.rest ?? null, sup: supIndexOf(routine, id),
            sets, ...(note ? { note } : {}),
          }
        })
        set({ active: { id: uid(), d: today(), name, rid, start: Date.now(), entries } })
      },
      addEntry(exId, cfg = null, routine = null) {
        const a = get().active
        if (!a || a.entries.some(e => e.exId === exId)) return false
        const ex = get().allEx().find(e => e.id === exId)
        const { sets, note } = get().buildSets(exId, cfg)
        set({
          active: {
            ...a,
            entries: [...a.entries, {
              exId, name: ex?.n || exId, type: ex?.type || 'reps',
              restSec: ex?.rest ?? null, sup: supIndexOf(routine, exId),
              sets, ...(note ? { note } : {}),
            }],
          },
        })
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
      copySet(exId, i) {
        const a = get().active
        if (!a) return
        set({
          active: {
            ...a,
            entries: a.entries.map(e => {
              if (e.exId !== exId) return e
              const src = e.sets[i]
              if (!src) return e
              const sets = [...e.sets]
              sets.splice(i + 1, 0, { ...src, done: false })
              return { ...e, sets }
            }),
          },
        })
      },
      setEntryRest(exId, sec) {
        const a = get().active
        if (!a) return
        set({ active: { ...a, entries: a.entries.map(e => (e.exId === exId ? { ...e, restSec: sec } : e)) } })
      },

      /* ---- 计划与模板 ---- */
      setPlanMode(mode) { set({ plan: { ...get().plan, mode } }) },
      assignDay(day, rid) {
        const week = { ...get().plan.week }
        if (rid) week[day] = rid
        else delete week[day]
        set({ plan: { ...get().plan, week } })
      },
      setRotation(rotation) { set({ plan: { ...get().plan, rotation } }) },
      updateRoutine(id, patch) {
        set({ routines: get().routines.map(r => (r.id === id ? { ...r, ...patch } : r)) })
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
        const { settings, customEx, routines, plan, workouts, bodyweight, active } = get()
        return JSON.stringify({ app: 'gym-gym', version: 2, exportedAt: new Date().toISOString(), settings, customEx, routines, plan, workouts, bodyweight, active }, null, 2)
      },
      importState(json) {
        const d = JSON.parse(json)
        if (d.app !== 'gym-gym') throw new Error('不是 gym-gym 的备份文件')
        set({
          settings: { ...get().settings, ...d.settings },
          customEx: Array.isArray(d.customEx) ? d.customEx : [],
          routines: (Array.isArray(d.routines) ? d.routines : PRESET_ROUTINES).map(r => ({ cfg: DEFAULT_CFG(), supersets: [], ...r })),
          plan: d.plan || { mode: 'week', week: { 1: 'push', 3: 'pull', 5: 'legs' }, rotation: ['push', 'pull', 'legs'] },
          workouts: Array.isArray(d.workouts) ? d.workouts : [],
          bodyweight: Array.isArray(d.bodyweight) ? d.bodyweight : [],
          active: d.active || null,
        })
      },
      resetAll() {
        set({
          settings: { restSec: 90, sound: true, vibrate: true },
          customEx: [], routines: PRESET_ROUTINES,
          plan: { mode: 'week', week: { 1: 'push', 3: 'pull', 5: 'legs' }, rotation: ['push', 'pull', 'legs'] },
          workouts: [], bodyweight: [], active: null,
        })
      },

      /* ---- 派生 ---- */
      allEx() { return [...EXERCISES, ...get().customEx] },
    }),
    {
      name: 'gym_gym_v1',
      version: 2,
      /* v1 → v2：补 plan 与 routine 的 cfg/supersets 字段，旧数据原样保留 */
      migrate: (p, ver) => {
        if (ver < 2) {
          p.plan = p.plan || { mode: 'week', week: { 1: 'push', 3: 'pull', 5: 'legs' }, rotation: ['push', 'pull', 'legs'] }
          p.routines = (p.routines || PRESET_ROUTINES).map(r => ({ cfg: DEFAULT_CFG(), supersets: [], ...r }))
        }
        return p
      },
      partialize: s => ({
        settings: s.settings, customEx: s.customEx, routines: s.routines, plan: s.plan,
        workouts: s.workouts, bodyweight: s.bodyweight, active: s.active,
      }),
    }
  )
)
