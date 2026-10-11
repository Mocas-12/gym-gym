import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import RestTimer from '../components/RestTimer.jsx'
import ExercisePicker from '../components/ExercisePicker.jsx'

const fmtElapsed = ms => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function WorkoutView() {
  const { active, settings } = useStore()
  const { addEntry, removeEntry, addSet, updateSet, toggleDone, deleteSet, finishWorkout, discardWorkout } = useStore()
  const { startRest, toast } = useUI()
  const [now, setNow] = useState(Date.now())
  const [picking, setPicking] = useState(false)
  const scroller = useRef(null)

  /* 屏幕常亮 + 每秒刷新计时 */
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    let lock = null
    const acquire = async () => {
      try { lock = await navigator.wakeLock?.request('screen') } catch { /* 不支持/被拒 */ }
    }
    if (active) acquire()
    const onVis = () => { if (document.visibilityState === 'visible' && active) acquire() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVis); try { lock?.release() } catch { } }
  }, [active != null])

  if (!active) {
    return (
      <div className="page empty-page">
        <div className="empty-icon">🏋️</div>
        <p className="dim">没有进行中的训练</p>
        <button className="btn primary" onClick={() => { location.hash = '#/home' }}>去开始一个</button>
      </div>
    )
  }

  const onPick = (ex, added) => {
    if (ex) {
      if (!addEntry(ex.id)) toast('这个动作已经在训练里了')
    }
    if (ex === null) setPicking(false)
  }

  const done = (exId, i, ex) => {
    const rest = toggleDone(exId, i)
    if (rest > 0) {
      startRest(rest, ex.type === 'time' ? ex.name : `${ex.name} · 下一组`)
      navigator.vibrate?.(60)
    }
  }

  return (
    <div className="page workout-page">
      <RestTimer />
      <div className="workout-head">
        <div>
          <div className="h2">{active.name}</div>
          <div className="dim mono">{fmtElapsed(now - active.start)}</div>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => { if (confirm('放弃这次训练？记录不会保存。')) { discardWorkout(); location.hash = '#/home' } }}>放弃</button>
          <button className="btn primary" onClick={() => {
            const w = finishWorkout()
            if (!w) { toast('还没有完成任何一组'); return }
            toast(`已保存 · ${w.entries.length} 个动作${w.prs?.length ? ` · 🎉 ${w.prs.length} 个PR` : ''}`)
            location.hash = '#/home'
          }}>完成</button>
        </div>
      </div>

      {active.entries.map(en => {
        const ex = { name: en.name, type: en.type || 'reps', ...en }
        return (
          <div key={en.exId} className="card entry">
            <div className="row-between">
              <div className="card-title">{en.name}</div>
              <button className="icon-btn" title="移除动作" onClick={() => removeEntry(en.exId)}>✕</button>
            </div>
            {en.sets.length === 0 && <div className="dim small">还没有组，点下方添加</div>}
            {en.sets.map((s, i) => (
              <div key={i} className={'set-row' + (s.done ? ' done' : '')}>
                <span className="set-n">{i + 1}</span>
                <input
                  className="input set-input" inputMode="decimal"
                  placeholder={ex.type === 'time' ? '秒' : 'kg'}
                  value={s.kg ?? ''}
                  onChange={e => updateSet(en.exId, i, { kg: e.target.value === '' ? null : parseFloat(e.target.value) })}
                />
                <span className="x">×</span>
                <input
                  className="input set-input" inputMode="numeric"
                  placeholder={ex.type === 'time' ? '速度' : '次数'}
                  value={s.reps ?? ''}
                  onChange={e => updateSet(en.exId, i, { reps: e.target.value === '' ? null : parseInt(e.target.value) })}
                />
                <button
                  className={'done-btn' + (s.done ? ' on' : '')}
                  onClick={() => done(en.exId, i, ex)}
                >✓</button>
                <button className="icon-btn" onClick={() => deleteSet(en.exId, i)}>🗑</button>
              </div>
            ))}
            <button className="btn ghost block sm" onClick={() => addSet(en.exId)}>＋ 添加一组</button>
          </div>
        )
      })}

      <button className="btn ghost block" onClick={() => setPicking(true)}>＋ 添加动作</button>
      {picking && <ExercisePicker onAdd={onPick} />}
    </div>
  )
}
