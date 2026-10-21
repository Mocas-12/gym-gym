import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import ExercisePicker from './ExercisePicker.jsx'
import SchemeRow from './SchemeRow.jsx'
import { localDate } from '../lib/dates.js'

const dateStrOf = ts => localDate(ts)
const newId = () =>
  'bk' + [...crypto.getRandomValues(new Uint8Array(5))].map(x => x.toString(16).padStart(2, '0')).join('')

/* 历史训练编辑器：改名/改日期/逐组增删改/快捷方案，也用于补记（workout=null 时新建）。
 * 保存走 store 的 addWorkout/updateWorkout，容量与 PR 自动重算（withStats）。 */
export default function WorkoutEdit({ workout, onClose }) {
  const addWorkout = useStore(s => s.addWorkout)
  const updateWorkout = useStore(s => s.updateWorkout)
  const allEx = useStore(s => s.allEx)
  const toast = useUI(s => s.toast)
  /* 草稿：存 sessionStorage——中途切走菜单再回来，填了一半的内容自动恢复 */
  const DKEY = 'gym_edit_draft_' + (workout?.id || 'new')
  const draft = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(DKEY) || 'null')
    } catch {
      return null
    }
  }, [DKEY])
  const clearDraft = () => sessionStorage.removeItem(DKEY)

  const [name, setName] = useState(draft?.name ?? workout?.name ?? '补记训练')
  const [dateStr, setDateStr] = useState(draft?.dateStr ?? dateStrOf(workout?.start || Date.now()))
  const [entries, setEntries] = useState(
    () =>
      draft?.entries ??
      (workout?.entries || []).map(e => ({ ...e, sets: (e.sets || []).map(s => ({ ...s })) }))
  )
  const [picking, setPicking] = useState(false)
  const list = allEx()
  const nameOf = eid => list.find(e => e.id === eid)?.n || eid

  /* 草稿持久化：填了一半的内容随改动写入 sessionStorage，切走菜单不丢 */
  useEffect(() => {
    sessionStorage.setItem(DKEY, JSON.stringify({ name, dateStr, entries }))
  }, [DKEY, name, dateStr, entries])

  const patchEntry = (i, fn) => setEntries(prev => prev.map((e, k) => (k === i ? fn(e) : e)))
  const addSet = i =>
    patchEntry(i, e => {
      const prev = e.sets[e.sets.length - 1]
      const blank =
        e.type === 'cardio'
          ? { min: null, speed: null, incl: null, done: true }
          : e.type === 'time'
            ? { sec: null, done: true }
            : { kg: prev?.kg ?? null, reps: prev?.reps ?? null, done: true }
      return { ...e, sets: [...e.sets, blank] }
    })
  const applyScheme = (i, n, reps, kg) =>
    patchEntry(i, e => ({
      ...e,
      sets: Array.from({ length: n }, () => ({ kg, reps, done: true })),
    }))
  /* 切换式：已在列表里再点一次 = 移除；函数式更新防止快速连点的闭包叠加 */
  const toggleEx = ex => {
    setEntries(prev => {
      if (prev.some(e => e.exId === ex.id)) return prev.filter(e => e.exId !== ex.id)
      const blank =
        ex.type === 'cardio'
          ? { min: null, speed: null, incl: null, done: true }
          : ex.type === 'time'
            ? { sec: null, done: true }
            : { kg: null, reps: null, done: true }
      return [...prev, { exId: ex.id, name: ex.n, type: ex.type || 'reps', m: ex.m || null, sets: [blank] }]
    })
  }
  const save = () => {
    const dur = workout ? Math.max(600e3, (workout.end ?? workout.start) - workout.start) : 3600e3
    const start = new Date(dateStr + 'T12:00:00').getTime()
    const doc = {
      ...(workout || {}),
      id: workout?.id || newId(),
      name: name.trim() || '训练',
      d: dateStr,
      start,
      end: start + dur,
      entries,
    }
    const saved = workout ? updateWorkout(workout.id, doc) : addWorkout(doc)
    if (!saved) {
      toast('还没有完成的组，保存不了')
      return
    }
    clearDraft()
    toast(workout ? '已更新 · 统计已重算' : '已补记')
    onClose()
  }

  return (
    <div className="sheet-mask top" onClick={onClose}>
      <div className="sheet tall" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <input
            className="input grow"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="训练名"
          />
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </div>
        <div className="sheet-body">
          <div className="section-title" style={{ marginTop: 6 }}>
            日期
          </div>
          <input
            type="date"
            className="input block"
            value={dateStr}
            max={dateStrOf(Date.now())}
            onChange={e => setDateStr(e.target.value)}
          />
          <div className="section-title">动作（{entries.length}）</div>
          {entries.map((en, i) => (
            <div key={en.exId + i} className="card">
              <div className="row-between">
                <div className="card-title">{en.name || nameOf(en.exId)}</div>
                <button className="icon-btn" onClick={() => setEntries(entries.filter((_, k) => k !== i))}>
                  ✕
                </button>
              </div>
              {en.type !== 'cardio' && en.type !== 'time' && (
                <SchemeRow onApply={(n, reps, kg) => applyScheme(i, n, reps, kg)} />
              )}
              {en.sets.map((s, j) => (
                <div key={j} className="set-row" style={{ marginTop: 6 }}>
                  <span className="set-n">{j + 1}</span>
                  {en.type === 'cardio' ? (
                    <>
                      <input
                        className="input set-input"
                        inputMode="numeric"
                        placeholder="分"
                        value={s.min ?? ''}
                        onChange={e =>
                          patchEntry(i, en2 => ({
                            ...en2,
                            sets: en2.sets.map((x, k) =>
                              k === j
                                ? { ...x, min: e.target.value === '' ? null : parseFloat(e.target.value) }
                                : x
                            ),
                          }))
                        }
                      />
                      <input
                        className="input set-input"
                        inputMode="decimal"
                        placeholder="速度"
                        value={s.speed ?? ''}
                        onChange={e =>
                          patchEntry(i, en2 => ({
                            ...en2,
                            sets: en2.sets.map((x, k) =>
                              k === j
                                ? { ...x, speed: e.target.value === '' ? null : parseFloat(e.target.value) }
                                : x
                            ),
                          }))
                        }
                      />
                      <input
                        className="input set-input"
                        inputMode="decimal"
                        placeholder="坡度"
                        value={s.incl ?? ''}
                        onChange={e =>
                          patchEntry(i, en2 => ({
                            ...en2,
                            sets: en2.sets.map((x, k) =>
                              k === j
                                ? { ...x, incl: e.target.value === '' ? null : parseFloat(e.target.value) }
                                : x
                            ),
                          }))
                        }
                      />
                    </>
                  ) : en.type === 'time' ? (
                    <input
                      className="input set-input"
                      style={{ width: 120 }}
                      inputMode="numeric"
                      placeholder="秒"
                      value={s.sec ?? s.kg ?? ''}
                      onChange={e =>
                        patchEntry(i, en2 => ({
                          ...en2,
                          sets: en2.sets.map((x, k) =>
                            k === j
                              ? { ...x, sec: e.target.value === '' ? null : parseFloat(e.target.value) }
                              : x
                          ),
                        }))
                      }
                    />
                  ) : (
                    <>
                      <input
                        className="input set-input"
                        inputMode="decimal"
                        placeholder="kg"
                        value={s.kg ?? ''}
                        onChange={e =>
                          patchEntry(i, en2 => ({
                            ...en2,
                            sets: en2.sets.map((x, k) =>
                              k === j
                                ? { ...x, kg: e.target.value === '' ? null : parseFloat(e.target.value) }
                                : x
                            ),
                          }))
                        }
                      />
                      <span className="x">×</span>
                      <input
                        className="input set-input"
                        inputMode="numeric"
                        placeholder="次数"
                        value={s.reps ?? ''}
                        onChange={e =>
                          patchEntry(i, en2 => ({
                            ...en2,
                            sets: en2.sets.map((x, k) =>
                              k === j
                                ? { ...x, reps: e.target.value === '' ? null : parseInt(e.target.value) }
                                : x
                            ),
                          }))
                        }
                      />
                    </>
                  )}
                  <button
                    className="icon-btn"
                    onClick={() =>
                      patchEntry(i, en2 => ({ ...en2, sets: en2.sets.filter((_, k) => k !== j) }))
                    }
                  >
                    🗑
                  </button>
                </div>
              ))}
              <button className="btn ghost block sm" onClick={() => addSet(i)}>
                ＋ 添加一组
              </button>
            </div>
          ))}
          <button className="btn ghost block" onClick={() => setPicking(true)}>
            ＋ 添加动作
          </button>
          <div className="row">
            <button className="btn primary grow" onClick={save}>
              保存
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                clearDraft()
                onClose()
              }}
            >
              取消
            </button>
          </div>
        </div>
      </div>
      {picking && (
        <ExercisePicker
          selected={entries.map(e => e.exId)}
          onToggle={toggleEx}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
