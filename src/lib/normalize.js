/* 状态文档净化：历史页崩溃（null is not an object / n.entries）的终极防线。
 *
 * 背景：真机上 workouts 数组曾反复混入 null / 缺 entries 的记录。此前只在版本升级时
 * 清洗一次，脏数据随后又会进来。现在改为三道防线：
 *   ① 迁移（版本升级）② onRehydrateStorage 每次启动 ③ adoptRemote/importState 等写入口
 * 全部走 normalizeState —— 任何脏数据最多活到下次启动，内存态永远干净，
 * 且下一次 persist 会把干净数据写回存储，实现存储自愈。
 */
// @ts-check

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
    .filter((/** @type {any} */ w) => w && typeof w === 'object' && Array.isArray(w.entries))
    .map((/** @type {any} */ w) => ({
      ...w,
      entries: w.entries.filter((/** @type {any} */ e) => e && typeof e === 'object' && e.exId),
    }))
    .filter((/** @type {any} */ w) => w.entries.length > 0) // 清洗后一个有效动作都不剩的记录没有保留价值
  doc.bodyweight = (Array.isArray(doc.bodyweight) ? doc.bodyweight : []).filter(
    (/** @type {any} */ e) => e && typeof e === 'object'
  )
  doc.customEx = (Array.isArray(doc.customEx) ? doc.customEx : []).filter(
    (/** @type {any} */ e) => e && typeof e === 'object' && e.id
  )
  return p
}
