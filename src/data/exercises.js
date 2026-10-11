/* 内置练习库（纯本地、开源数据思路自建，无授权素材）。
 * id / n 名称 / m 肌群 / eq 器械 / type reps|time / rest 默认休息秒 */
const E = (id, n, m, eq, type = 'reps', rest) => ({ id, n, m, eq, type, rest })

export const MUSCLES = ['胸', '背', '肩', '手臂', '腿', '臀', '核心', '有氧']

export const EXERCISES = [
  // 胸
  E('bench', '杠铃卧推', '胸', '杠铃', 'reps', 120),
  E('incline-db', '上斜哑铃卧推', '胸', '哑铃', 'reps', 105),
  E('db-fly', '哑铃飞鸟', '胸', '哑铃', 'reps', 75),
  E('cable-fly', '绳索夹胸', '胸', '绳索', 'reps', 75),
  E('pec-deck', '蝴蝶机夹胸', '胸', '器械', 'reps', 75),
  E('dips', '双杠臂屈伸', '胸', '自重', 'reps', 90),
  E('pushup', '俯卧撑', '胸', '自重', 'reps', 60),
  // 背
  E('pullup', '引体向上', '背', '自重', 'reps', 120),
  E('lat-pulldown', '高位下拉', '背', '器械', 'reps', 90),
  E('barbell-row', '杠铃划船', '背', '杠铃', 'reps', 120),
  E('db-row', '单臂哑铃划船', '背', '哑铃', 'reps', 75),
  E('seated-row', '坐姿划船', '背', '器械', 'reps', 90),
  E('deadlift', '硬拉', '背', '杠铃', 'reps', 180),
  E('rdl', '罗马尼亚硬拉', '腿', '杠铃', 'reps', 120),
  E('straight-arm-pulldown', '直臂下压', '背', '绳索', 'reps', 60),
  // 肩
  E('ohp', '站姿杠铃推举', '肩', '杠铃', 'reps', 120),
  E('db-shoulder-press', '坐姿哑铃推肩', '肩', '哑铃', 'reps', 90),
  E('lateral-raise', '哑铃侧平举', '肩', '哑铃', 'reps', 60),
  E('front-raise', '哑铃前平举', '肩', '哑铃', 'reps', 60),
  E('rear-delt-fly', '反向飞鸟', '肩', '哑铃', 'reps', 60),
  E('face-pull', '面拉', '肩', '绳索', 'reps', 60),
  E('upright-row', '直立划船', '肩', '杠铃', 'reps', 75),
  // 手臂
  E('barbell-curl', '杠铃弯举', '手臂', '杠铃', 'reps', 75),
  E('db-curl', '哑铃交替弯举', '手臂', '哑铃', 'reps', 60),
  E('hammer-curl', '锤式弯举', '手臂', '哑铃', 'reps', 60),
  E('preacher-curl', '牧师凳弯举', '手臂', '器械', 'reps', 60),
  E('triceps-pushdown', '绳索下压', '手臂', '绳索', 'reps', 60),
  E('skull-crusher', '仰卧臂屈伸', '手臂', '杠铃', 'reps', 75),
  E('close-grip-bench', '窄距卧推', '手臂', '杠铃', 'reps', 105),
  // 腿 / 臀
  E('squat', '深蹲', '腿', '杠铃', 'reps', 150),
  E('leg-press', '腿举', '腿', '器械', 'reps', 105),
  E('hack-squat', '哈克深蹲', '腿', '器械', 'reps', 120),
  E('leg-curl', '腿弯举', '腿', '器械', 'reps', 75),
  E('leg-ext', '腿屈伸', '腿', '器械', 'reps', 75),
  E('lunge', '箭步蹲', '腿', '哑铃', 'reps', 90),
  E('calf-raise', '站姿提踵', '腿', '自重', 'reps', 45),
  E('hip-thrust', '臀推', '臀', '杠铃', 'reps', 105),
  E('glute-bridge', '臀桥', '臀', '自重', 'reps', 45),
  // 核心
  E('plank', '平板支撑', '核心', '自重', 'time', 45),
  E('crunch', '卷腹', '核心', '自重', 'reps', 45),
  E('hanging-leg-raise', '悬垂举腿', '核心', '自重', 'reps', 60),
  E('russian-twist', '俄罗斯转体', '核心', '自重', 'reps', 45),
  E('ab-wheel', '健腹轮', '核心', '器械', 'reps', 60),
  // 有氧（type=time，重量列为分钟/速度）
  E('treadmill', '跑步机', '有氧', '器械', 'time', 0),
  E('elliptical', '椭圆机', '有氧', '器械', 'time', 0),
  E('row-erg', '划船机', '有氧', '器械', 'time', 0),
  E('jump-rope', '跳绳', '有氧', '自重', 'time', 0),
]
