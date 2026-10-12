import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import ExercisePicker from './ExercisePicker.jsx'
import { SCHEMES } from '../lib/progression.js'

/* 模板的渐进规则展示文案 */
export const cfgLabel = c =>
  !c || c.scheme === 'none' ? '不自动加重'
    : c.scheme === 'linear' ? `线性 ${c.inc}kg · 目标${c.reps}次`
      : c.scheme === 'greyskull' ? `Greyskull ${c.reps}次 · +${c.inc}kg`
        : c.scheme === 'triple' ? `三进程 ${c.min}-${c.max}次 × ${c.sets}组`
          : c.scheme === 'time' ? `计时 +${c.incSec}s · 目标 ${c.targetSec}秒`
            : `双进程 ${c.min}-${c.max}次 · +${c.inc}kg`

/* 模板编辑器：名称、动作列表（排序/超级组/独立休息）、渐进规则。
 * supersets 按「相邻行同组」建模：joins[i]=true 表示第 i 行与上一行同一超级组。 */
export default function RoutineEdit({ id, onClose }) {
  const routine = useStore(s => s.routines.find(r => r.id === id))
  const updateRoutine = useStore(s => s.updateRoutine)
  const [name, setName] = useState(routine.name)
  const [exIds, setExIds] = useState(routine.exIds)
  const [joins, setJoins] = useState(() => joinsFromGroups(routine.exIds, routine.supersets || []))
  const [cfg, setCfg] = useState({ ...{ scheme: 'none', inc: 2.5, reps: 8, min: 6, max: 10 }, ...routine.cfg })
  const [picking, setPicking] = useState(false)
  const allEx = useStore(s => s.allEx)
  const list = allEx()
  const nameOf = eid => list.find(e => e.id === eid)?.n || eid

  const groups = useMemo(() => groupsFromJoins(exIds, joins), [exIds, joins])
  const supCount = groups.filter(g => g.length > 1).length

  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= exIds.length) return
    const a = [...exIds];[a[i], a[j]] = [a[j], a[i]]
    setExIds(a)
    const jb = [...joins]
    ;[jb[i], jb[j]] = [jb[j], jb[i]] // join 标志跟着行走
    setJoins(jb)
  }
  const remove = i => { setExIds(exIds.filter((_, k) => k !== i)); setJoins(joins.filter((_, k) => k !== i)) }
  const onPick = ex => {
    if (ex && !exIds.includes(ex.id)) { setExIds([...exIds, ex.id]); setJoins([...joins, false]) }
    if (ex === null) setPicking(false)
  }
  const save = () => {
    updateRoutine(id, { name: name.trim() || routine.name, exIds, supersets: groups.filter(g => g.length > 1), cfg })
    onClose()
  }

  return (
    <div className="sheet-mask top" onClick={onClose}>
      <div className="sheet tall" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <input className="input grow" value={name} onChange={e => setName(e.target.value)} placeholder="模板名" />
          <button className="btn primary" onClick={save}>保存</button>
        </div>
        <div className="sheet-body">
          <div className="section-title" style={{ marginTop: 6 }}>渐进规则 · <span className="accent">{cfgLabel(cfg)}</span></div>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {SCHEMES.map(s => (
              <button key={s.id} className={'chip' + (cfg.scheme === s.id ? ' on' : '')} onClick={() => setCfg({ ...cfg, scheme: s.id })}>{s.name}</button>
            ))}
          </div>
          {cfg.scheme === 'linear' && (
            <div className="cfg-row">
              <NumField label="每次加重 kg" value={cfg.inc} step={0.5} onChange={v => setCfg({ ...cfg, inc: v })} />
              <NumField label="目标次数" value={cfg.reps} step={1} onChange={v => setCfg({ ...cfg, reps: v })} />
            </div>
          )}
          {cfg.scheme === 'greyskull' && (
            <div className="cfg-row">
              <NumField label="加重 kg" value={cfg.inc} step={0.5} onChange={v => setCfg({ ...cfg, inc: v })} />
              <NumField label="目标次数" value={cfg.reps} step={1} onChange={v => setCfg({ ...cfg, reps: v })} />
              <NumField label="冲刺加成 kg" value={cfg.bonusInc} step={0.5} onChange={v => setCfg({ ...cfg, bonusInc: v })} />
            </div>
          )}
          {cfg.scheme === 'double' && (
            <div className="cfg-row">
              <NumField label="加重 kg" value={cfg.inc} step={0.5} onChange={v => setCfg({ ...cfg, inc: v })} />
              <NumField label="最少次数" value={cfg.min} step={1} onChange={v => setCfg({ ...cfg, min: v })} />
              <NumField label="最多次数" value={cfg.max} step={1} onChange={v => setCfg({ ...cfg, max: v })} />
            </div>
          )}
          {cfg.scheme === 'triple' && (
            <div className="cfg-row">
              <NumField label="加重 kg" value={cfg.inc} step={0.5} onChange={v => setCfg({ ...cfg, inc: v })} />
              <NumField label="次数区间" value={cfg.min} step={1} onChange={v => setCfg({ ...cfg, min: v })} />
              <NumField label="至" value={cfg.max} step={1} onChange={v => setCfg({ ...cfg, max: v })} />
              <NumField label="组数" value={cfg.sets} step={1} onChange={v => setCfg({ ...cfg, sets: v })} />
              <NumField label="加到" value={cfg.setsMax} step={1} onChange={v => setCfg({ ...cfg, setsMax: v })} />
            </div>
          )}
          {cfg.scheme === 'time' && (
            <div className="cfg-row">
              <NumField label="目标秒数" value={cfg.targetSec} step={5} onChange={v => setCfg({ ...cfg, targetSec: v })} />
              <NumField label="每次加秒" value={cfg.incSec} step={5} onChange={v => setCfg({ ...cfg, incSec: v })} />
              <NumField label="上限秒" value={cfg.maxSec} step={5} onChange={v => setCfg({ ...cfg, maxSec: v })} />
            </div>
          )}

          <div className="section-title">动作（{exIds.length}）{supCount ? ` · ${supCount} 组超级组` : ''}</div>
          {exIds.map((eid, i) => (
            <div key={eid} className="edit-row">
              <span className="set-n">{i + 1}</span>
              <div className="grow">
                <div>{nameOf(eid)}</div>
                {i > 0 && (
                  <button className={'chip sm' + (joins[i] ? ' on' : '')} style={{ marginTop: 4 }}
                    onClick={() => setJoins(joins.map((v, k) => (k === i ? !v : v)))}>
                    ↔ 与上一个组成超级组
                  </button>
                )}
              </div>
              <button className="icon-btn" onClick={() => move(i, -1)}>↑</button>
              <button className="icon-btn" onClick={() => move(i, 1)}>↓</button>
              <button className="icon-btn" onClick={() => remove(i)}>✕</button>
            </div>
          ))}
          <button className="btn ghost block sm" onClick={() => setPicking(true)}>＋ 添加动作</button>

          <div className="row">
            <button className="btn primary grow" onClick={save}>保存模板</button>
            <button className="btn ghost" onClick={onClose}>取消</button>
          </div>
        </div>
      </div>
      {picking && <ExercisePicker onAdd={onPick} />}
    </div>
  )
}

function NumField({ label, value, step, onChange }) {
  return (
    <label className="num-field">
      <span className="dim small">{label}</span>
      <input className="input" inputMode="decimal" value={value}
        onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v) }} step={step} />
    </label>
  )
}

/* joins ↔ supersets 互转：相邻行同组 → 组数组 */
function joinsFromGroups(exIds, groups) {
  const gOf = eid => groups.findIndex(g => g.includes(eid))
  return exIds.map((eid, i) => (i > 0 ? gOf(eid) >= 0 && gOf(eid) === gOf(exIds[i - 1]) : false))
}
function groupsFromJoins(exIds, joins) {
  const out = []
  for (let i = 0; i < exIds.length; i++) {
    if (i > 0 && joins[i] && out.length) out[out.length - 1].push(exIds[i])
    else out.push([exIds[i]])
  }
  return out
}
