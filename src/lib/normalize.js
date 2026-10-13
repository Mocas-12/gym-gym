/* 状态文档净化：历史页崩溃（null is not an object / n.entries）的终极防线。
 *
 * 背景：真机上 workouts 数组曾反复混入 null / 缺 entries 的记录。此前只在版本升级时
 * 清洗一次，脏数据随后又会进来。现在改为三道防线：
 *   ① 迁移（版本升级）② onRehydrateStorage 每次启动 ③ adoptRemote/importState 等写入口
 * 全部走 normalizeState —— 任何脏数据最多活到下次启动，内存态永远干净，
 * 且下一次 persist 会把干净数据写回存储，实现存储自愈。
 */

export function normalizeState(p) {
  if (!p || typeof p !== 'object') return p
  p.workouts = (Array.isArray(p.workouts) ? p.workouts : [])
    .filter(w => w && typeof w === 'object' && Array.isArray(w.entries))
    .map(w => ({ ...w, entries: w.entries.filter(e => e && typeof e === 'object' && e.exId) }))
    .filter(w => w.entries.length > 0) // 清洗后一个有效动作都不剩的记录没有保留价值
  p.bodyweight = (Array.isArray(p.bodyweight) ? p.bodyweight : []).filter(e => e && typeof e === 'object')
  p.customEx = (Array.isArray(p.customEx) ? p.customEx : []).filter(e => e && typeof e === 'object' && e.id)
  return p
}
