/* 状态文档净化：历史页崩溃（null is not an object / n.entries）的终极防线。
 *
 * 背景：真机上 workouts 数组曾反复混入 null / 缺 entries 的记录。此前只在版本升级时
 * 清洗一次，脏数据随后又会进来。现在改为三道防线：
 *   ① 迁移（版本升级）② onRehydrateStorage 每次启动 ③ adoptRemote/importState 等写入口
 * 全部走 normalizeState —— 任何脏数据最多活到下次启动，内存态永远干净，
 * 且下一次 persist 会把干净数据写回存储，实现存储自愈。
 */
// @ts-check
import { boundedSetCount } from './sets.js'
import { rebuildStats } from './workout.js'
import { DEFAULT_CFG, SCHEMES } from './progression.js'

/** @param {any} value @returns {boolean} */
const object = value => value && typeof value === 'object' && !Array.isArray(value)

/** @param {any} workout @returns {any} */
function cleanWorkout(workout) {
  if (!object(workout) || !Array.isArray(workout.entries)) return null
  return {
    ...workout,
    ...(workout.name != null && typeof workout.name !== 'string' ? { name: '训练' } : {}),
    entries: workout.entries
      .filter((/** @type {any} */ e) => object(e) && typeof e.exId === 'string' && e.exId)
      .map((/** @type {any} */ e) => ({
        ...e,
        plannedSets: boundedSetCount(
          e.plannedSets,
          (Array.isArray(e.sets) ? e.sets : []).filter((/** @type {any} */ s) => s && !s.w).length
        ),
        ...(e.name != null && typeof e.name !== 'string' ? { name: e.exId } : {}),
        ...(e.note != null && typeof e.note !== 'string' ? { note: '' } : {}),
        sets: (Array.isArray(e.sets) ? e.sets : []).filter(object).map((/** @type {any} */ s) => {
          const set = { ...s }
          for (const field of ['kg', 'reps', 'sec', 'min', 'speed', 'incl', 'rir']) {
            if (set[field] != null && (!Number.isFinite(set[field]) || set[field] < 0)) delete set[field]
          }
          if ('done' in set) set.done = set.done === true
          if ('w' in set) set.w = set.w === true
          return set
        }),
      })),
  }
}

/**
 * 就地净化一份状态文档并原样返回（非对象输入直接返回）。
 * @template T
 * @param {T} p 任意来源的状态文档（本地存储 / 云端 / 导入文件）
 * @returns {T}
 */
export function normalizeState(p) {
  if (!p || typeof p !== 'object') return p
  const doc = /** @type {any} */ (p)
  doc.workouts = (Array.isArray(doc.workouts) ? doc.workouts : [])
    .map(cleanWorkout)
    .filter((/** @type {any} */ w) => w && w.entries.length > 0)
  doc.workouts = rebuildStats(doc.workouts)
  if ('active' in doc) doc.active = Number.isFinite(doc.active?.start) ? cleanWorkout(doc.active) : null
  doc.bodyweight = (Array.isArray(doc.bodyweight) ? doc.bodyweight : [])
    .filter((/** @type {any} */ e) => object(e) && Number.isFinite(e.kg) && e.kg > 0)
    .sort(
      (/** @type {any} */ a, /** @type {any} */ b) =>
        (b.t || Date.parse(b.d) || 0) - (a.t || Date.parse(a.d) || 0)
    )
  doc.customEx = (Array.isArray(doc.customEx) ? doc.customEx : [])
    .filter((/** @type {any} */ e) => object(e) && typeof e.id === 'string' && e.id)
    .map((/** @type {any} */ e) => ({ ...e, n: typeof e.n === 'string' ? e.n : e.id }))
  if ('routines' in doc)
    doc.routines = (Array.isArray(doc.routines) ? doc.routines : [])
      .filter((/** @type {any} */ r) => object(r) && typeof r.id === 'string')
      .map((/** @type {any} */ r) => ({
        ...r,
        name: typeof r.name === 'string' ? r.name : r.id,
        exIds: (Array.isArray(r.exIds) ? r.exIds : []).filter(
          (/** @type {any} */ id) => typeof id === 'string'
        ),
        supersets: (Array.isArray(r.supersets) ? r.supersets : [])
          .filter(Array.isArray)
          .map((/** @type {any[]} */ group) => group.filter(id => typeof id === 'string')),
        cfg: cleanConfig(r.cfg),
      }))
  if ('settings' in doc && !object(doc.settings)) doc.settings = {}
  if (doc.settings) {
    if (!Number.isFinite(doc.settings.restSec) || doc.settings.restSec < 0 || doc.settings.restSec > 900)
      doc.settings.restSec = 90
    if (doc.settings.plates) {
      const plates = doc.settings.plates
      doc.settings.plates = {
        bar: Number.isFinite(plates.bar) && plates.bar > 0 ? plates.bar : 20,
        avail: (Array.isArray(plates.avail) ? plates.avail : [25, 20, 15, 10, 5, 2.5, 1.25]).filter(
          (/** @type {any} */ n) => Number.isFinite(n) && n > 0
        ),
      }
    }
  }
  if ('plan' in doc) {
    const plan = object(doc.plan) ? doc.plan : {}
    doc.plan = {
      mode: plan.mode === 'rotation' ? 'rotation' : 'week',
      week: Object.fromEntries(
        Object.entries(object(plan.week) ? plan.week : {}).filter(
          ([day, id]) => /^[0-6]$/.test(day) && typeof id === 'string'
        )
      ),
      rotation: (Array.isArray(plan.rotation) ? plan.rotation : []).filter(
        (/** @type {any} */ id) => typeof id === 'string'
      ),
    }
  }
  return p
}

/** @param {any} raw @returns {any} */
function cleanConfig(raw) {
  const defaults = DEFAULT_CFG()
  const cfg = { ...defaults }
  if (!object(raw)) return cfg
  if (SCHEMES.some(scheme => scheme.id === raw.scheme)) cfg.scheme = raw.scheme
  for (const key of /** @type {(keyof typeof defaults)[]} */ (Object.keys(defaults))) {
    if (key === 'scheme') continue
    const value = raw[key]
    const max = key === 'sets' || key === 'setsMax' ? 50 : 1000
    if (Number.isFinite(value) && value > 0 && value <= max)
      cfg[key] = key === 'sets' || key === 'setsMax' ? Math.floor(value) : value
  }
  cfg.max = Math.max(cfg.min, cfg.max)
  cfg.setsMax = Math.max(cfg.sets, cfg.setsMax)
  cfg.maxSec = Math.max(cfg.targetSec, cfg.maxSec)
  return cfg
}
