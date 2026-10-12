import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import ExercisePicker from './ExercisePicker.jsx'

const DAY = 86400000
const dateStrOf = ts => new Date(ts).toISOString().slice(0, 10)

/* 历史训练编辑器：改名/改日期/改组/删动作，也用于补记（workout=null 时新建）。
 * 保存走 store 的 addWorkout/updateWorkout，容量与 PR 自动重算。 */
export default function WorkoutEdit({ workout, onClose }) {
  const addWorkout = useStore(s => s.addWorkout)
  const updateWorkout = useStore(s => s.updateWorkout)
  const allEx = useStore(s => s.allEx)
  const toast = useUI(s => s.toast)
  const [name, setName] = useState(workout?.name || '补记训练')
  const [dateStr, setDateStr] = useState(dateStrOf(workout?.start || Date.now()))
  const [entries, setEntries] = useState(() =>
    (workout?.entries || []).map(e => ({ ...e, sets: (e.sets || []).map(s => ({ ...s })) }))
  )
  const [picking, setPicking] = useState(false)
  const list = allEx()
  const nameOf = eid => list.find(e => e.id === eid)?.n || eid

  const patchEntry = (i, fn) => setEntries(entries.map((e, k) => (k === i ? fn(e) : e)))
  const addSet = i => patchEntry(i, e => {
    const prev = e.sets[e.sets.length - 1]
    return { ...e, sets: [...e.sets, { kg: prev?.kg ?? null, reps: prev?.reps ?? null, done: true }] }
  })
  const addEx = ex => {
    if (!ex) { setPicking(false); return }
    if (entries.some(e => e.exId === ex.id)) return
    setEntries([...entries, { exId: ex.id, name: ex.n, type: ex.type || 'reps', m: ex.m || null, sets: [{ kg: null, reps: null, done: true }] }])
  }
  const save = () => {
    // 日期取当天 12:00，避开时区边缘；时长沿用原训练
    const dur = workout ? Math.max(600e3, (workout.end ?? workout.start) - workout.start) : 3600e3
    const start = new Date(dateStr + 'T12:00:00').getTime()
    const doc = { ...(workout || {}), id: workout?.id || ('bk' + [...crypto.getRandomValues(new Uint8Array(5))].map(x => x.toString(16).padStart(2, '0')).join('')), name: name.trim() || '训练', d: dateStr, start, end: start + dur, entries }
    const saved = workout ? updateWorkout(workout.id, doc) : addWorkout(doc)
    if (!saved) { toast('还没有完成的组，保存不了'); return }
    toast(workout ? '已更新 · 统计已重算' : '已补记')
    onClose()
  }

  return (
    <div className="sheet-mask top" onClick={onClose}>
      <div className="sheet tall" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <input className="input grow" value={name} onChange={e => setName(e.target.value)} placeholder="训练名" />
          <button className="btn primary" onClick={save}>保存</button>
        </div>
        <div className="sheet-body">
          <div className="section-title" style={{ marginTop: 6 }}>日期</div>
          <input type="date" className="input block" value={dateStr} max={dateStrOf(Date.now())}
            onChange={e => setDateStr(e.target.value)} />
          <div className="section-title">动作（{entries.length}）</div>
          {entries.map((en, i) => (
            <div key={en.exId + i} className="card">
              <div className="row-between">
                <div className="card-title">{en.name || nameOf(en.exId)}</div>
                <button className="icon-btn" onClick={() => setEntries(entries.filter((_, k) => k !== i))}>✕</button>
              </div>
              {en.sets.map((s, j) => (
                <div key={j} className="set-row" style={{ marginTop: 6 }}>
                  <span className="set-n">{j + 1}</span>
                  <input className="input set-input" inputMode="decimal" placeholder="kg" value={s.kg ?? ''}
                    onChange={e => patchEntry(i, en2 => ({ ...en2, sets: en2.sets.map((x, k) => (k === j ? { ...x, kg: e.target.value === '' ? null : parseFloat(e.target.value) } : x)) }))} />
                  <span className="x">×</span>
                  <input className="input set-input" inputMode="numeric" placeholder="次数" value={s.reps ?? ''}
                    onChange={e => patchEntry(i, en2 => ({ ...en2, sets: en2.sets.map((x, k) => (k === j ? { ...x, reps: e.target.value === '' ? null : parseInt(e.target.value) } : x)) }))} />
                  <button className="icon-btn" onClick={() => patchEntry(i, en2 => ({ ...en2, sets: en2.sets.filter((_, k) => k !== j) }))}>🗑</button>
                </div>
              ))}
              <button className="btn ghost block sm" onClick={() => addSet(i)}>＋ 添加一组</button>
            </div>
          ))}
          <button className="btn ghost block" onClick={() => setPicking(true)}>＋ 添加动作</button>
          <div className="row">
            <button className="btn primary grow" onClick={save}>保存</button>
            <button className="btn ghost" onClick={onClose}>取消</button>
          </div>
          {picking && <ExercisePicker onAdd={addEx} />}
        </div>
      </div>
    </div>
  )
}
