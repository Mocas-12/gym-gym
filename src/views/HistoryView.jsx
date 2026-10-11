import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { best1RM } from '../lib/onerm.js'

const fmtDate = ts => new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
const fmtDur = ms => `${Math.round(ms / 60000)} 分钟`

export default function HistoryView() {
  const { workouts, bodyweight, deleteWorkout } = useStore()
  const [openId, setOpenId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  /* 每个动作的历史最佳（估计 1RM）——历史数据可能有脏值，逐条过滤 */
  const prs = useMemo(() => {
    const best = {}
    for (const w of workouts) for (const e of w.entries || []) {
      const b = best1RM(e.sets)
      if (Number.isFinite(b) && b > (best[e.exId]?.e1rm || 0)) best[e.exId] = { exId: e.exId, name: e.name, e1rm: b }
    }
    return Object.values(best).sort((a, b) => b.e1rm - a.e1rm)
  }, [workouts])

  const monthCount = workouts.filter(w => new Date(w.start).getMonth() === new Date().getMonth()).length
  const monthVolume = workouts
    .filter(w => new Date(w.start).getMonth() === new Date().getMonth())
    .reduce((s, w) => s + (w.volume || 0), 0)

  return (
    <div className="page">
      <h1 className="h1">历史</h1>

      <div className="stat-row">
        <div className="card stat"><div className="big-num">{monthCount}</div><div className="dim">本月训练</div></div>
        <div className="card stat"><div className="big-num">{(monthVolume / 1000).toFixed(1)}<small>t</small></div><div className="dim">本月容量</div></div>
        <div className="card stat"><div className="big-num">{workouts.length}</div><div className="dim">全部记录</div></div>
      </div>

      {bodyweight.length > 1 && (
        <>
          <div className="section-title">体重曲线</div>
          <div className="card"><WeightChart data={[...bodyweight].reverse()} /></div>
        </>
      )}
      {prs.length > 0 && (
        <>
          <div className="section-title">动作最佳 · 估计1RM</div>
          <div className="card">
            {prs.slice(0, 8).map(p => (
              <div key={p.exId} className="row-between pr-row">
                <span>{p.name}</span>
                <span className="mono accent">{p.e1rm.toFixed(1)} kg</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">训练记录</div>
      {workouts.length === 0 && <p className="dim center">还没有训练记录，去首页开始第一次吧。</p>}
      {workouts.map(w => (
        <div key={w.id} className="card">
          <button className="row-between card-open" onClick={() => setOpenId(openId === w.id ? null : w.id)}>
            <div>
              <div className="card-title">{w.name}</div>
              <div className="dim">{fmtDate(w.start)} · {fmtDur((w.end ?? w.start) - w.start)} · {((w.volume ?? 0) / 1000).toFixed(1)}t{w.prs?.length ? ` · 🎉${w.prs.length} PR` : ''}</div>
            </div>
            <span className="chev">{openId === w.id ? '▾' : '›'}</span>
          </button>
          {openId === w.id && (
            <div className="detail">
              {(w.entries || []).map(e => (
                <div key={e.exId} className="detail-ex">
                  <div className="card-title">{e.name}</div>
                  <div className="mono dim small">{e.sets.map(s => `${s.kg ?? 0}×${s.reps}`).join('　')}</div>
                </div>
              ))}
              {confirmDel === w.id ? (
                <div className="row">
                  <button className="btn danger" onClick={() => { deleteWorkout(w.id); setConfirmDel(null) }}>确认删除</button>
                  <button className="btn ghost" onClick={() => setConfirmDel(null)}>取消</button>
                </div>
              ) : (
                <button className="btn ghost sm" onClick={() => setConfirmDel(w.id)}>删除这条记录</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function WeightChart({ data: raw }) {
  // 脏数据防御：只留数值型 kg，且至少两点才画
  const data = (raw || []).filter(e => e && Number.isFinite(e.kg))
  if (data.length < 2) return null
  const ks = data.map(e => e.kg)
  const min = Math.min(...ks) - 0.5, max = Math.max(...ks) + 0.5
  const span = max - min || 1
  const W = 320, H = 90
  const pts = data.map((e, i) => [(i / Math.max(1, data.length - 1)) * W, H - 10 - ((e.kg - min) / span) * (H - 24)])
  const line = pts.map(p => p.join(',')).join(' ')
  const last = data[data.length - 1]
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="spark">
        <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="var(--accent)" />)}
      </svg>
      <div className="row-between dim small">
        <span>{fmtDate(data[0].t ?? data[0].d)}</span>
        <span>{data.length} 次记录</span>
        <span>现在 {last.kg} kg</span>
      </div>
    </div>
  )
}
