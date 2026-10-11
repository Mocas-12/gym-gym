/* 出厂模板：普通可编辑数据，用户可改、可新建。cfg=渐进规则（双进程 6-10 次 +2.5kg）。 */
import { EXERCISES } from './exercises.js'
import { DEFAULT_CFG } from '../lib/progression.js'

const ids = names => names.map(n => EXERCISES.find(e => e.n === n)?.id).filter(Boolean)
const cfg = DEFAULT_CFG()

export const PRESET_ROUTINES = [
  {
    id: 'push',
    name: '推日 · 胸肩三头',
    exIds: ids(['杠铃卧推', '上斜哑铃卧推', '坐姿哑铃推肩', '哑铃侧平举', '绳索下压']),
    supersets: [],
    cfg,
  },
  {
    id: 'pull',
    name: '拉日 · 背二头',
    exIds: ids(['引体向上', '杠铃划船', '高位下拉', '面拉', '杠铃弯举']),
    supersets: [],
    cfg,
  },
  {
    id: 'legs',
    name: '腿日',
    exIds: ids(['深蹲', '腿举', '罗马尼亚硬拉', '腿弯举', '站姿提踵']),
    supersets: [],
    cfg,
  },
  {
    id: 'fullbody',
    name: '全身 · 居家',
    exIds: ids(['俯卧撑', '哑铃单臂划船', '箭步蹲', '平板支撑']),
    supersets: [],
    cfg,
  },
]
