/* 单一 Zustand store 持有全部数据，localStorage 持久化（openGym 的简化版）。
 * 训练中会话放在 active 里：刷新/杀进程后恢复，finish 后归档进 workouts。 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { EXERCISES } from '../data/exercises.js'
import { PRESET_ROUTINES } from '../data/routines.js'
import { finalizeWorkout, prefillFor, withStats, rebuildStats } from '../lib/workout.js'
import { nextTarget, DEFAULT_CFG } from '../lib/progression.js'
import { pushData, pullData } from '../lib/sync.js'
import { normalizeState } from '../lib/normalize.js'
import { assertWritable, durableStorage, usePersistence } from './persistence.js'
import { boundedSetCount, validSet, MAX_SETS } from '../lib/sets.js'
import { localDate } from '../lib/dates.js'
import { readRecovery, writeRecovery, deleteRecovery } from '../lib/recovery.js'
import { DATA_KEYS, fingerprints, mergeDocuments, chooseConflicts, sameFingerprints } from '../lib/merge.js'

/* getRandomValues 而非 randomUUID：后者在 iOS 15.3- 和非安全上下文（局域网 http 调试）不存在 */
const uid = () =>
  [...crypto.getRandomValues(new Uint8Array(8))]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 11)
const today = () => localDate()

/* 超级组：routine.supersets 是按相邻行分组的多组数组（如 [['bench','ohp']]）。
 * 组内动作在训练里交替做。编辑器里用「与上一个同组」开关维护。 */
const supIndexOf = (routine, exId) => {
  const i = routine?.supersets?.findIndex(g => g.includes(exId))
  return i >= 0 ? i : null
}

/* 修改序号识别请求期间的新改动；dirty 随数据持久化，重启后仍会补传。 */
let changeVersion = 0
let connectionVersion = 0
let inFlight = null
const snapshot = state => Object.fromEntries(DATA_KEYS.map(key => [key, state[key]]))

const guardedWrites = creator => (set, get, api) =>
  creator(
    patch => {
      assertWritable()
      return set(patch)
    },
    get,
    api
  )

export const useStore = create(
  persist(
    guardedWrites((set, get) => ({
      settings: { restSec: 90, sound: true, vibrate: true },
      customEx: [], // 用户自建练习
      routines: PRESET_ROUTINES,
      plan: { mode: 'week', week: { 1: 'push', 3: 'pull', 5: 'legs' }, rotation: ['push', 'pull', 'legs'] },
      sync: {
        url: '',
        token: '',
        uid: '',
        rev: 0,
        lastSync: 0,
        dirty: false,
        conflict: null,
        status: 'idle',
      },
      recovery: null,
      workouts: [], // {id, d, name, rid, start, end, entries, volume, prs}
      bodyweight: [], // {d, t, kg}
      active: null, // 进行中的训练，结构同 workouts 条目

      /* ---- 训练 ---- */
      /* 从渐进引擎/预填构建该动作的初始组。cfg 来自所从的 routine（null=自由训练只预填）。 */
      buildSets(exId, cfg) {
        const { workouts } = get()
        const type = get()
          .allEx()
          .find(ex => ex.id === exId)?.type
        const effective =
          type === 'cardio'
            ? null
            : type === 'time' && cfg && cfg.scheme !== 'none'
              ? { ...cfg, scheme: 'time' }
              : cfg?.scheme === 'time'
                ? null
                : cfg
        const t = nextTarget(effective, workouts, exId)
        if (t) {
          const n = boundedSetCount(
            t.sets ||
              workouts.flatMap(w => w.entries).find(e => e.exId === exId)?.plannedSets ||
              cfg?.sets ||
              3
          )
          return {
            sets: Array.from({ length: n }, () => ({
              kg: t.kg,
              reps: t.reps,
              ...(t.sec != null ? { sec: t.sec } : {}),
              done: false,
            })),
            note: t.note,
            targetSec: t.sec,
          }
        }
        if (
          type === 'time' &&
          effective?.scheme === 'time' &&
          !workouts.some(w => w.entries.some(e => e.exId === exId))
        ) {
          const sec = effective.targetSec || 45
          return {
            sets: Array.from({ length: boundedSetCount(effective.sets) }, () => ({ sec, done: false })),
            note: null,
            targetSec: sec,
          }
        }
        return { sets: prefillFor(exId, workouts), note: null }
      },
      startWorkout(name = '自由训练', entryIds = [], rid = null) {
        const routine = rid ? get().routines.find(r => r.id === rid) : null
        const entries = entryIds.map(id => {
          const ex = get()
            .allEx()
            .find(e => e.id === id)
          const { sets, note, targetSec } = get().buildSets(id, routine?.cfg || null)
          return {
            exId: id,
            name: ex?.n || id,
            type: ex?.type || 'reps',
            m: ex?.m || null,
            eq: ex?.eq || null,
            restSec: ex?.rest ?? null,
            sup: supIndexOf(routine, id),
            sets,
            ...(targetSec != null ? { targetSec } : {}),
            ...(note ? { note } : {}),
          }
        })
        set({ active: { id: uid(), d: today(), name, rid, start: Date.now(), entries } })
      },
      addEntry(exId, cfg = null, routine = null) {
        const a = get().active
        if (!a || a.entries.some(e => e.exId === exId)) return false
        const ex = get()
          .allEx()
          .find(e => e.id === exId)
        const { sets, note, targetSec } = get().buildSets(exId, cfg)
        set({
          active: {
            ...a,
            entries: [
              ...a.entries,
              {
                exId,
                name: ex?.n || exId,
                type: ex?.type || 'reps',
                m: ex?.m || null,
                eq: ex?.eq || null,
                restSec: ex?.rest ?? null,
                sup: supIndexOf(routine, exId),
                sets,
                ...(targetSec != null ? { targetSec } : {}),
                ...(note ? { note } : {}),
              },
            ],
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
              if (e.exId !== exId || e.sets.length >= MAX_SETS) return e
              const prev = e.sets[e.sets.length - 1]
              const s =
                copyPrev && prev
                  ? { ...prev, done: false }
                  : { reps: prev?.reps ?? 10, kg: prev?.kg ?? 0, done: false }
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
        if (!s.done && !validSet(s, e.type))
          throw new Error('请先填写有效的次数、秒数或分钟数；重量可填 0 表示自重')
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
            entries: a.entries.map(e =>
              e.exId !== exId ? e : { ...e, sets: e.sets.filter((_, j) => j !== i) }
            ),
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
              if (e.exId !== exId || e.sets.length >= MAX_SETS) return e
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
        set({
          active: { ...a, entries: a.entries.map(e => (e.exId === exId ? { ...e, restSec: sec } : e)) },
        })
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
      /* 快捷方案：一次生成 N 组相同 kg×reps 的组（组内仍可单独修改） */
      applyScheme(exId, n, reps, kg) {
        const a = get().active
        if (!a || !(n > 0)) return
        set({
          active: {
            ...a,
            entries: a.entries.map(e =>
              e.exId !== exId
                ? e
                : {
                    ...e,
                    sets: Array.from({ length: boundedSetCount(n) }, () => ({ kg, reps, done: false })),
                  }
            ),
          },
        })
      },

      /* ---- 历史编辑/补记：改完的文档重算容量与 PR（withStats），并按时间排序 ---- */
      addWorkout(doc) {
        const clean = withStats(doc, get().workouts)
        if (!clean.entries.length) return null
        set({ workouts: rebuildStats([clean, ...get().workouts]) })
        return clean
      },
      async updateWorkout(id, patch) {
        const cur = get().workouts.find(w => w?.id === id)
        if (!cur) return null
        const others = get().workouts.filter(w => w?.id !== id)
        const clean = withStats({ ...cur, ...patch, id }, others)
        if (!clean.entries.length) return null
        const recovery = await get().saveRecovery('编辑训练')
        set({ recovery, workouts: rebuildStats([clean, ...others]) })
        return clean
      },

      /* 记录级冲突保留双方，选择只影响冲突行。 */
      setSync(patch) {
        const old = get().sync
        const changed =
          (patch.url != null && patch.url !== old.url) || (patch.token != null && patch.token !== old.token)
        if (changed) connectionVersion++
        set({
          sync: { ...old, ...(changed ? { conflict: null, status: 'idle', base: null } : {}), ...patch },
        })
      },
      async adoptRemote(state, rev, backup = true) {
        const recovery = backup ? await get().saveRecovery('采纳云端数据') : get().recovery
        const clean = normalizeState({ ...state })
        set({
          ...Object.fromEntries(
            DATA_KEYS.filter(key => clean[key] !== undefined).map(key => [key, clean[key]])
          ),
          recovery,
        })
        get().setSync({ rev, lastSync: Date.now(), dirty: false, conflict: null, status: 'synced' })
      },
      async syncNow() {
        const s = get().sync
        if (
          !usePersistence.getState().writable ||
          !usePersistence.getState().ready ||
          usePersistence.getState().pending
        )
          return 'off'
        if (!s.url || !s.token) return 'off'
        if (s.conflict) return 'conflict'
        if (inFlight) return inFlight
        const connection = connectionVersion,
          epoch = usePersistence.getState().epoch
        const connected = () =>
          connectionVersion === connection &&
          usePersistence.getState().writable &&
          !usePersistence.getState().pending &&
          usePersistence.getState().epoch === epoch
        get().setSync({ status: 'syncing' })
        if (!connected()) return 'off'
        inFlight = (async () => {
          try {
            // 每次先拉取。409 后重新合并，绝不按旧 revision 覆盖。
            for (let attempt = 0; attempt < 3; attempt++) {
              const response = await pullData(s.url, s.token)
              if (!connected()) return 'off'
              if (!response.ok) throw new Error('pull')
              const { state: cloud, rev = 0 } = response.data
              const local = snapshot(get()),
                version = changeVersion
              const remote = cloud || local
              const result = await mergeDocuments(local, remote, get().sync.base || {})
              if (!connected()) return 'off'
              if (version !== changeVersion) continue
              if (result.conflicts.length) {
                get().setSync({ conflict: { ...result, state: remote, rev, version }, status: 'conflict' })
                return 'conflict'
              }
              const merged = normalizeState(result.merged)
              const hashes = await fingerprints(merged)
              if (!connected()) return 'off'
              if (version !== changeVersion) continue
              let nextRev = rev
              if (!cloud || !sameFingerprints(hashes, result.remoteHashes)) {
                const push = await pushData(s.url, s.token, rev, merged)
                if (!connected()) return 'off'
                if (push.status === 409) continue
                if (!push.ok) throw new Error('push')
                nextRev = push.data.rev
              }
              // 请求期间的新编辑保留在本机，下次以请求前本机为祖先继续合并。
              if (version !== changeVersion) {
                get().setSync({ rev: nextRev, base: result.localHashes, dirty: true, status: 'synced' })
                return 'synced'
              }
              if (!sameFingerprints(hashes, result.localHashes)) {
                try {
                  const recovery = await get().saveRecovery('同步合并')
                  set({ recovery })
                } catch {
                  get().setSync({ rev: nextRev, base: result.localHashes, dirty: true, status: 'error' })
                  return 'error'
                }
                if (!connected()) return 'off'
                await get().adoptRemote(merged, nextRev, false)
              }
              get().setSync({
                rev: nextRev,
                base: hashes,
                dirty: false,
                lastSync: Date.now(),
                status: 'synced',
              })
              return 'synced'
            }
            throw new Error('数据仍在变化，请重试')
          } catch {
            if (connected()) get().setSync({ status: 'error' })
            return 'error'
          } finally {
            inFlight = null
          }
        })()
        return inFlight
      },
      async resolveConflict(choice) {
        const conflict = get().sync.conflict
        if (!conflict) return
        if (conflict.version !== changeVersion) {
          get().setSync({ conflict: null })
          return get().syncNow()
        }
        const connection = connectionVersion
        const recovery = await get().saveRecovery(
          '解决同步冲突',
          JSON.stringify({ ...conflict.state, app: 'gym-gym', version: 2 })
        )
        const resolved = chooseConflicts(conflict, choice)
        if (connection !== connectionVersion || get().sync.conflict !== conflict) return 'off'
        set({ recovery })
        await get().adoptRemote(resolved, conflict.rev, false)
        get().setSync({ base: conflict.remoteHashes, dirty: true })
        return get().syncNow()
      },

      /* ---- 计划与模板 ---- */
      setPlanMode(mode) {
        set({ plan: { ...get().plan, mode } })
      },
      assignDay(day, rid) {
        const week = { ...get().plan.week }
        if (rid) week[day] = rid
        else delete week[day]
        set({ plan: { ...get().plan, week } })
      },
      setRotation(rotation) {
        set({ plan: { ...get().plan, rotation } })
      },
      updateRoutine(id, patch) {
        set({ routines: get().routines.map(r => (r.id === id ? { ...r, ...patch } : r)) })
      },
      finishWorkout() {
        const { active, workouts } = get()
        if (!active) return null
        const { workout } = finalizeWorkout(active, workouts)
        if (!workout) return null
        set({ workouts: rebuildStats([workout, ...workouts]), active: null })
        return workout
      },
      discardWorkout() {
        set({ active: null })
      },
      async deleteWorkout(id) {
        const recovery = await get().saveRecovery('删除训练')
        set({ recovery, workouts: rebuildStats(get().workouts.filter(w => w.id !== id)) })
      },

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
      setSettings(patch) {
        set({ settings: { ...get().settings, ...patch } })
      },
      exportState() {
        const { settings, customEx, routines, plan, workouts, bodyweight, active } = get()
        return JSON.stringify(
          {
            app: 'gym-gym',
            version: 2,
            exportedAt: new Date().toISOString(),
            settings,
            customEx,
            routines,
            plan,
            workouts,
            bodyweight,
            active,
          },
          null,
          2
        )
      },
      async importState(json) {
        const d = JSON.parse(json)
        if (!d || d.app !== 'gym-gym' || Array.isArray(d)) throw new Error('不是 gym-gym 的备份文件')
        const clean = normalizeState(d)
        const recovery = await get().saveRecovery('导入备份')
        set({
          recovery,
          settings: { ...get().settings, ...clean.settings },
          customEx: clean.customEx,
          routines: (clean.routines || PRESET_ROUTINES).map(r => ({
            supersets: [],
            ...r,
            cfg: { ...DEFAULT_CFG(), ...r.cfg },
          })),
          plan: clean.plan || {
            mode: 'week',
            week: { 1: 'push', 3: 'pull', 5: 'legs' },
            rotation: ['push', 'pull', 'legs'],
          },
          workouts: clean.workouts,
          bodyweight: clean.bodyweight,
          active: clean.active || null,
        })
      },
      async saveRecovery(reason, remoteJson) {
        const version = changeVersion,
          active = get().active
        const value = {
          json: get().exportState(),
          reason,
          at: Date.now(),
          ...(remoteJson ? { remoteJson } : {}),
        }
        const epoch = usePersistence.getState().epoch
        const id = await writeRecovery(value)
        if (
          version !== changeVersion ||
          active !== get().active ||
          !usePersistence.getState().writable ||
          epoch !== usePersistence.getState().epoch
        ) {
          await deleteRecovery(id).catch(() => {})
          throw new Error('数据已变化，请重试')
        }
        return { id, reason, at: value.at, hasRemote: !!remoteJson }
      },
      async restoreRecovery(remote = false) {
        const recovery = get().recovery
        if (!recovery) return false
        const value = recovery.json ? recovery : await readRecovery(recovery.id)
        const json = remote ? value?.remoteJson : value?.json
        if (!json) throw new Error('恢复点不存在，请使用导出的备份')
        await get().importState(json)
        return true
      },
      async resetAll() {
        const recovery = await get().saveRecovery('清空数据')
        set({
          recovery,
          settings: { restSec: 90, sound: true, vibrate: true },
          customEx: [],
          routines: PRESET_ROUTINES,
          plan: {
            mode: 'week',
            week: { 1: 'push', 3: 'pull', 5: 'legs' },
            rotation: ['push', 'pull', 'legs'],
          },
          workouts: [],
          bodyweight: [],
          active: null,
        })
      },

      /* ---- 派生 ---- */
      allEx() {
        return [...EXERCISES, ...get().customEx]
      },
    })),
    {
      storage: durableStorage,
      skipHydration: true,
      name: 'gym_gym_v1',
      version: 5,
      /* v1→v2：补 plan 与 routine 的 cfg/supersets；v3：清洗脏数据——
       * 真机上曾出现 workouts 数组混入 null 导致历史页崩溃（ErrorBoundary 兜住）。
       * v4：加云同步配置；v5：持久化待同步标记与恢复点。 */
      migrate: (p, ver) => {
        if (ver < 2) {
          p.plan = p.plan || {
            mode: 'week',
            week: { 1: 'push', 3: 'pull', 5: 'legs' },
            rotation: ['push', 'pull', 'legs'],
          }
          p.routines = (Array.isArray(p.routines) ? p.routines : PRESET_ROUTINES)
            .filter(Boolean)
            .map(r => ({ supersets: [], ...r, cfg: { ...DEFAULT_CFG(), ...r.cfg } }))
        }
        if (ver < 4) p.sync = p.sync || { url: '', token: '', uid: '', rev: 0, lastSync: 0 }
        if (ver < 5) p.sync = { ...p.sync, dirty: true, conflict: null, status: 'idle' }
        return normalizeState(p)
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          usePersistence.setState({
            loadError: '读取本机数据失败，请勿清除站点数据。请重试或先导出原始备份。',
          })
          return
        }
        // 就地净化 rehydrate 后的状态：渲染前生效，下一次 persist 写回干净副本
        if (state) {
          normalizeState(state)
          durableStorage.setItem('gym_gym_v1', {
            state: useStore.persist.getOptions().partialize(state),
            version: 5,
          })
        }
        // 等写锁和恢复完成，再由入口启动同步。
      },
      partialize: s => ({
        settings: s.settings,
        customEx: s.customEx,
        routines: s.routines,
        plan: s.plan,
        sync: { ...s.sync, conflict: null, status: 'idle' },
        workouts: s.workouts,
        bodyweight: s.bodyweight,
        active: s.active,
        recovery: s.recovery,
      }),
    }
  )
)

/* 领域数据改动标记待上传；每 60s 及回前台同步，干净时只拉取。 */
useStore.subscribe((state, prev) => {
  if (usePersistence.getState().ready && DATA_KEYS.some(key => state[key] !== prev[key])) {
    changeVersion++
    state.setSync({ dirty: true })
  }
})
setInterval(() => {
  const s = useStore.getState()
  if (s.sync.url && s.sync.token) s.syncNow()
}, 60000)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  const s = useStore.getState()
  if (s.sync.url && s.sync.token) s.syncNow()
})
