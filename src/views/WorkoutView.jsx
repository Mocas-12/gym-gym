import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import RestTimer from '../components/RestTimer.jsx'
import ExercisePicker from '../components/ExercisePicker.jsx'
import SetRow from '../components/SetRow.jsx'
import { platesFor, fmtPlates, STANDARD_PLATES } from '../lib/plates.js'

const fmtElapsed = ms => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const REST_OPTS = [45, 60, 90, 120, 150, 180]

export default function WorkoutView() {
  const { active, settings } = useStore()
  const { addEntry, removeEntry, addSet, updateSet, toggleDone, deleteSet, copySet, toggleWarmup, finishWorkout, discardWorkout, setEntryRest } = useStore()
  const { startRest, toast } = useUI()
  const [now, setNow] = useState(Date.now())
  const [picking, setPicking] = useState(false)
  const [restPickFor, setRestPickFor] = useState(null)

  /* 屏幕常亮 + 每秒刷新计时 */
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    let lock = null
    const acquire = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch { /* 不支持/被拒 */ } }
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

  /* 超级组：entry.sup 是组序号；同组动作交替做 */
  const supPartner = en => {
    if (en.sup == null) return null
    const p = active.entries.find(x => x.sup === en.sup && x.exId !== en.exId)
    return p?.name || null
  }

  const onPick = ex => {
    if (ex) {
      if (!addEntry(ex.id)) toast('这个动作已经在训练里了')
    } else setPicking(false)
  }

  const done = (en, i) => {
    const rest = toggleDone(en.exId, i)
    if (rest > 0) {
      const partner = supPartner(en)
      const label = partner ? `↔ 接着做 ${partner}` : (en.type === 'time' ? en.name : `${en.name} · 下一组`)
      startRest(rest, label)
      navigator.vibrate?.(60)
    }
  }

  const restOf = en => en.restSec ?? settings.restSec
  const plates = settings.plates || { bar: 20, avail: STANDARD_PLATES }
  /* 杠铃动作：按最后填过的重量算每边配重 */
  const plateLine = en => {
    if (en.eq !== '杠铃') return null
    const kg = [...(en.sets || [])].reverse().find(s => s.kg > 0)?.kg
    if (!kg) return null
    const { perSide, leftover, tooLight } = platesFor(kg, plates.bar, plates.avail)
    return tooLight ? `${kg}kg 轻于空杆（${plates.bar}kg）` : `每边：${fmtPlates(perSide)}${leftover ? ` · 差 ${leftover}kg 没有合适的片` : ''}`
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
        const partner = supPartner(en)
        return (
          <div key={en.exId} className={'card entry' + (en.sup != null ? ` sup sup-${en.sup % 3}` : '')}>
            <div className="row-between">
              <div className="card-title">
                {en.sup != null && <span className="sup-dot" />}
                {en.name}
                {partner && <span className="dim small sup-tag"> ↔ {partner}</span>}
              </div>
              <div className="row" style={{ marginTop: 0 }}>
                <button className="rest-chip" onClick={() => setRestPickFor(restPickFor === en.exId ? null : en.exId)}>⏱{restOf(en)}s</button>
                <button className="icon-btn" title="移除动作" onClick={() => removeEntry(en.exId)}>✕</button>
              </div>
            </div>
            {en.note && <div className="target-note">{en.note}</div>}
            {plateLine(en) && <div className="plate-line mono">{plateLine(en)}</div>}
            {restPickFor === en.exId && (
              <div className="rest-picker">
                {REST_OPTS.map(s => (
                  <button key={s} className={'chip' + (restOf(en) === s ? ' on' : '')} onClick={() => { setEntryRest(en.exId, s); setRestPickFor(null) }}>{s}s</button>
                ))}
              </div>
            )}
            {en.sets.length === 0 && <div className="dim small">还没有组，点下方添加（或右滑上一行复制）</div>}
            {en.sets.map((s, i) => (
              <SetRow
                key={i}
                idx={i}
                set={s}
                type={en.type}
                showRir={settings.showRir ?? true}
                onDone={() => done(en, i)}
                onDel={() => deleteSet(en.exId, i)}
                onCopy={() => copySet(en.exId, i)}
                onUpdate={patch => updateSet(en.exId, i, patch)}
                onToggleWarmup={() => toggleWarmup(en.exId, i)}
              />
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
