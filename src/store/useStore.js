/* 单一 Zustand store 持有全部数据，localStorage 持久化（openGym 的简化版）。
 * 训练中会话放在 active 里：刷新/杀进程后恢复，finish 后归档进 workouts。 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { EXERCISES } from '../data/exercises.js'
import { PRESET_ROUTINES } from '../data/routines.js'
import { finalizeWorkout, prefillFor, withStats } from '../lib/workout.js'
import { nextTarget, DEFAULT_CFG } from '../lib/progression.js'
import { pullData, pushData } from '../lib/sync.js'

/* getRandomValues 而非 randomUUID：后者在 iOS 15.3- 和非安全上下文（局域网 http 调试）不存在 */
const uid = () => [...crypto.getRandomValues(new Uint8Array(8))].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 11)
const today = () => new Date().toISOString().slice(0, 10)

/* 超级组：routine.supersets 是按相邻行分组的多组数组（如 [['bench','ohp']]）。
 * 组内动作在训练里交替做。编辑器里用「与上一个同组」开关维护。 */
const supIndexOf = (routine, exId) => {
  const i = routine?.supersets?.findIndex(g => g.includes(exId))
  return i >= 0 ? i : null
}

/* 本机最后一次数据改动时间：云同步冲突时判断「双方都有改动」用 */
let lastChangeAt = 0

export const useStore = create(
  persist(
    (set, get) => ({
      settings: { restSec: 90, sound: true, vibrate: true },
      customEx: [],          // 用户自建练习
      routines: PRESET_ROUTINES,
      plan: { mode: 'week', week: { 1: 'push', 3: 'pull', 5: 'legs' }, rotation: ['push', 'pull', 'legs'] },
      sync: { url: '', token: '', uid: '', rev: 0, lastSync: 0 },
      workouts: [],          // {id, d, name, rid, start, end, entries, volume, prs}
      bodyweight: [],        // {d, t, kg}
      active: null,          // 进行中的训练，结构同 workouts 条目

      /* ---- 训练 ---- */
      /* 从渐进引擎/预填构建该动作的初始组。cfg 来自所从的 routine（null=自由训练只预填）。 */
      buildSets(exId, cfg) {
        const { workouts } = get()
        const t = nextTarget(cfg, workouts, exId)
        if (t) {
          const n = t.sets || 3
          return { sets: Array.from({ length: n }, () => ({ kg: t.kg, reps: t.reps, done: false })), note: t.note }
        }
        return { sets: prefillFor(exId, workouts), note: null }
      },
      startWorkout(name = '自由训练', entryIds = [], rid = null) {
        const routine = rid ? get().routines.find(r => r.id === rid) : null
        const entries = entryIds.map(id => {
          const ex = get().allEx().find(e => e.id === id)
          const { sets, note } = get().buildSets(id, routine?.cfg || null)
          return {
            exId: id, name: ex?.n || id, type: ex?.type || 'reps', m: ex?.m || null, eq: ex?.eq || null,
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
              exId, name: ex?.n || exId, type: ex?.type || 'reps', m: ex?.m || null, eq: ex?.eq || null,
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
      /* 点组号切换热身组：不计容量/PR/1RM/恢复统计 */
      toggleWarmup(exId, i) {
        const a = get().active
        if (!a) return
        set({
          active: {
            ...a,
            entries: a.entries.map(e =>
              e.exId !== exId ? e : { ...e, sets: e.sets.map((s, j) => (j === i ? { ...s, w: !s.w } : s)) }
            ),
          },
        })
      },

      /* ---- 历史编辑/补记：改完的文档重算容量与 PR（withStats），并按时间排序 ---- */
      addWorkout(doc) {
        const clean = withStats(doc, get().workouts)
        if (!clean.entries.length) return null
        set({ workouts: [clean, ...get().workouts].sort((a, b) => b.start - a.start) })
        return clean
      },
      updateWorkout(id, patch) {
        const cur = get().workouts.find(w => w?.id === id)
        if (!cur) return null
        const others = get().workouts.filter(w => w?.id !== id)
        const clean = withStats({ ...cur, ...patch, id }, others)
        set({ workouts: [clean, ...others].sort((a, b) => b.start - a.start) })
        return clean
      },

      /* ---- 云同步（可选微后端，见 docs/SYNC_PUSH.md）----
       * 文档级 LWW：push 带 baseRev，409 时按「最后改动时间」新者胜。 */
      setSync(patch) { set({ sync: { ...get().sync, ...patch } }) },
      adoptRemote(state, rev) {
        const cur = get()
        set({
          settings: { restSec: 90, sound: true, vibrate: true, showRir: true, ...state.settings },
          customEx: Array.isArray(state.customEx) ? state.customEx : [],
          routines: (Array.isArray(state.routines) ? state.routines : []).map(r => ({ cfg: DEFAULT_CFG(), supersets: [], ...r })),
          plan: state.plan || cur.plan,
          workouts: Array.isArray(state.workouts) ? state.workouts : [],
          bodyweight: Array.isArray(state.bodyweight) ? state.bodyweight : [],
          sync: { ...cur.sync, rev, lastSync: Date.now() },
        })
      },
      async syncNow() {
        const s = get().sync
        if (!s.url || !s.token) return 'off'
        // active（进行中的训练）是设备本地的，不上云
        const { active, sync: _s, ...doc } = get()
        const snapshot = { ...doc, _ts: Date.now() }
        const r = await pushData(s.url, s.token, s.rev, snapshot)
        if (r.ok) { get().setSync({ rev: r.data.rev, lastSync: Date.now() }); return 'synced' }
        if (r.status !== 409) return 'error'
        // 冲突：另一台设备写过。本机无未同步改动 → 直接采纳云端；
        // 双方都有改动 → 谁最后改动谁胜（文档级 LWW）。
        const server = r.data
        const dirty = lastChangeAt > s.lastSync
        if (!dirty) {
          if (server.state) get().adoptRemote(server.state, server.rev)
          else get().setSync({ rev: server.rev, lastSync: Date.now() })
          return 'adopted'
        }
        if ((snapshot._ts || 0) >= (server.state?._ts || 0)) {
          const f = await pushData(s.url, s.token, server.rev, snapshot)
          if (f.ok) { get().setSync({ rev: f.data.rev, lastSync: Date.now() }); return 'overwritten' }
        } else {
          if (server.state) get().adoptRemote(server.state, server.rev)
          return 'adopted'
        }
        return 'conflict'
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
      version: 4,
      /* v1→v2：补 plan 与 routine 的 cfg/supersets；v3：清洗脏数据——
       * 真机上曾出现 workouts 数组混入 null 导致历史页崩溃（ErrorBoundary 兜住）。
       * v4：加云同步配置。 */
      migrate: (p, ver) => {
        if (ver < 2) {
          p.plan = p.plan || { mode: 'week', week: { 1: 'push', 3: 'pull', 5: 'legs' }, rotation: ['push', 'pull', 'legs'] }
          p.routines = (p.routines || PRESET_ROUTINES).map(r => ({ cfg: DEFAULT_CFG(), supersets: [], ...r }))
        }
        if (ver < 4) p.sync = p.sync || { url: '', token: '', uid: '', rev: 0, lastSync: 0 }
        p.workouts = (Array.isArray(p.workouts) ? p.workouts : []).filter(w => w && typeof w === 'object' && Array.isArray(w.entries))
        p.bodyweight = (Array.isArray(p.bodyweight) ? p.bodyweight : []).filter(e => e && typeof e === 'object')
        p.customEx = (Array.isArray(p.customEx) ? p.customEx : []).filter(e => e && typeof e === 'object' && e.id)
        return p
      },
      onRehydrateStorage: () => state => {
        // 启动即同步一次：云端有更新就拉下来，本机有欠账就推上去
        lastChangeAt = 0
        if (state?.sync?.url && state?.sync?.token) state.syncNow?.()
      },
      partialize: s => ({
        settings: s.settings, customEx: s.customEx, routines: s.routines, plan: s.plan, sync: s.sync,
        workouts: s.workouts, bodyweight: s.bodyweight, active: s.active,
      }),
    }
  )
)

/* 任意数据改动 → 记录时间；已配置云同步时：每 60s 推一次欠账、回前台推一次 */
useStore.subscribe(() => { lastChangeAt = Date.now() })
setInterval(() => {
  const s = useStore.getState()
  if (s.sync.url && s.sync.token && lastChangeAt > s.sync.lastSync) s.syncNow()
}, 60000)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  const s = useStore.getState()
  if (s.sync.url && s.sync.token && lastChangeAt > s.sync.lastSync) s.syncNow()
})
