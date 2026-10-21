import { useMemo, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { best1RM } from '../lib/onerm.js'
import { e1rmSeries, trainedExercises, heatmap } from '../lib/insights.js'
import { regionLoad, volumeLevels, recoveryLevels, neglectedLevels } from '../lib/muscles.js'
import { Heatmap, LineChart } from '../components/Charts.jsx'
import BodyMap from '../components/BodyMap.jsx'
import { isThisMonth } from '../lib/dates.js'
import WorkoutEdit from '../components/WorkoutEdit.jsx'

const fmtSet = (e, s) => {
  if (e.type === 'cardio') {
    const parts = [`${s.min ?? 0}分`]
    if (s.speed) parts.push(`@${s.speed}km/h`)
    if (s.incl) parts.push(`坡${s.incl}%`)
    return (s.w ? '热' : '') + parts.join('')
  }
  if (e.type === 'time') return `${s.sec ?? s.kg ?? 0}秒`
  return `${s.w ? '热' : ''}${s.kg ?? 0}×${s.reps}${s.rir != null ? ` R${s.rir}` : ''}`
}

const fmtDate = ts => new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
const fmtDur = ms => `${Math.round(ms / 60000)} 分钟`

export default function HistoryView() {
  const toast = useUI(s => s.toast)
  const { workouts, bodyweight, deleteWorkout, customEx, allEx, settings } = useStore()
  // 渲染一律基于净化后的列表（防御兜底：store 已保证，这里双保险）
  const list = useMemo(
    () => workouts.filter(w => w && typeof w === 'object' && Array.isArray(w.entries)),
    [workouts]
  )
  const [openId, setOpenId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [chartEx, setChartEx] = useState(null)
  const [editing, setEditing] = useState(undefined) // undefined=关；null=补记；对象=编辑该训练
  const [mapMode, setMapMode] = useState('vol')

  /* 洞察数据 */
  const trained = useMemo(() => trainedExercises(list), [list])
  const nameById = useMemo(() => {
    const m = {}
    for (const e of allEx()) m[e.id] = e.n
    return m
  }, [customEx])
  const activeEx = chartEx || trained[0]
  const series = useMemo(() => (activeEx ? e1rmSeries(list, activeEx) : []), [list, activeEx])
  const grid = useMemo(() => heatmap(list), [list])
  const mapLevels = useMemo(
    () =>
      mapMode === 'rec'
        ? recoveryLevels(list)
        : mapMode === 'gap'
          ? neglectedLevels(list)
          : volumeLevels(regionLoad(list, 7)),
    [list, mapMode]
  )
  const MAP_HINT = {
    vol: '近 7 天训练量分布 · 越亮练得越多',
    rec: '恢复进度 · 越亮恢复越完整',
    gap: '越亮 = 越久没练',
  }

  /* 每个动作的历史最佳（估计 1RM）——历史数据可能有脏值，逐条过滤 */
  const prs = useMemo(() => {
    const best = {}
    for (const w of workouts) {
      if (!w) continue
      for (const e of w.entries || []) {
        if (e.type === 'time' || e.type === 'cardio') continue
        const b = best1RM(e.sets)
        if (Number.isFinite(b) && b > (best[e.exId]?.e1rm || 0))
          best[e.exId] = { exId: e.exId, name: e.name, e1rm: b }
      }
    }
    return Object.values(best).sort((a, b) => b.e1rm - a.e1rm)
  }, [workouts])

  const monthCount = list.filter(w => isThisMonth(w.start)).length
  const monthVolume = list.filter(w => isThisMonth(w.start)).reduce((s, w) => s + (w.volume || 0), 0)

  return (
    <div className="page">
      <h1 className="h1">历史</h1>

      <div className="stat-row">
        <div className="card stat">
          <div className="big-num">{monthCount}</div>
          <div className="dim">本月训练</div>
        </div>
        <div className="card stat">
          <div className="big-num">
            {(monthVolume / 1000).toFixed(1)}
            <small>t</small>
          </div>
          <div className="dim">本月容量</div>
        </div>
        <div className="card stat">
          <div className="big-num">{workouts.length}</div>
          <div className="dim">全部记录</div>
        </div>
      </div>

      {bodyweight.length > 1 && (
        <>
          <div className="section-title">体重曲线</div>
          <div className="card">
            <WeightChart data={[...bodyweight].reverse()} goal={settings.goalKg} />
          </div>
        </>
      )}
      {trained.length > 0 && (
        <>
          <div className="section-title">动作 1RM 曲线</div>
          <div className="card">
            <div className="ex-chips">
              {trained.slice(0, 12).map(id => (
                <button
                  key={id}
                  className={'chip sm' + (activeEx === id ? ' on' : '')}
                  onClick={() => setChartEx(id)}
                >
                  {nameById[id] || id}
                </button>
              ))}
            </div>
            <LineChart data={series} />
          </div>
        </>
      )}

      <div className="section-title">近一年训练热力图</div>
      <div className="card">
        <Heatmap data={grid} />
        <div className="row-between dim small" style={{ marginTop: 8 }}>
          <span>一年前</span>
          <span>颜色越亮 = 容量越大</span>
          <span>今天</span>
        </div>
      </div>

      <div className="section-title">肌肉图</div>
      <div className="card">
        <div className="row" style={{ marginTop: 0 }}>
          <button
            className={'chip grow' + (mapMode === 'vol' ? ' on' : '')}
            onClick={() => setMapMode('vol')}
          >
            容量
          </button>
          <button
            className={'chip grow' + (mapMode === 'rec' ? ' on' : '')}
            onClick={() => setMapMode('rec')}
          >
            恢复
          </button>
          <button
            className={'chip grow' + (mapMode === 'gap' ? ' on' : '')}
            onClick={() => setMapMode('gap')}
          >
            盲区
          </button>
        </div>
        <BodyMap levels={mapLevels} />
        <div className="dim small center" style={{ marginTop: 6 }}>
          {MAP_HINT[mapMode]}
        </div>
      </div>

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

      <div className="row-between">
        <div className="section-title" style={{ marginTop: 0 }}>
          训练记录
        </div>
        <button className="btn ghost sm" onClick={() => setEditing(null)}>
          ＋ 补记一次
        </button>
      </div>
      {workouts.length === 0 && <p className="dim center">还没有训练记录，去首页开始第一次吧。</p>}
      {list.map(w => (
        <div key={w.id} className="card">
          <button className="row-between card-open" onClick={() => setOpenId(openId === w.id ? null : w.id)}>
            <div>
              <div className="card-title">{w.name}</div>
              <div className="dim">
                {fmtDate(w.start)} · {fmtDur((w.end ?? w.start) - w.start)} ·{' '}
                {((w.volume ?? 0) / 1000).toFixed(1)}t{w.prs?.length ? ` · 🎉${w.prs.length} PR` : ''}
              </div>
            </div>
            <span className="chev">{openId === w.id ? '▾' : '›'}</span>
          </button>
          {openId === w.id && (
            <div className="detail">
              {(w.entries || []).map(e => (
                <div key={e.exId} className="detail-ex">
                  <div className="card-title">{e.name}</div>
                  <div className="mono dim small">{e.sets.map(s => fmtSet(e, s)).join('　')}</div>
                </div>
              ))}
              {confirmDel === w.id ? (
                <div className="row">
                  <button
                    className="btn danger"
                    onClick={async () => {
                      try {
                        await deleteWorkout(w.id)
                      } catch (err) {
                        toast(err.message)
                      }
                      setConfirmDel(null)
                    }}
                  >
                    确认删除
                  </button>
                  <button className="btn ghost" onClick={() => setConfirmDel(null)}>
                    取消
                  </button>
                </div>
              ) : (
                <div className="row">
                  <button className="btn ghost sm" onClick={() => setEditing(w)}>
                    编辑
                  </button>
                  <button className="btn ghost sm" onClick={() => setConfirmDel(w.id)}>
                    删除
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {editing !== undefined && <WorkoutEdit workout={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function WeightChart({ data: raw, goal }) {
  // 脏数据防御：只留数值型 kg，且至少两点才画
  const data = (raw || []).filter(e => e && Number.isFinite(e.kg))
  if (data.length < 2) return null
  const ks = data.map(e => e.kg)
  const lo = Math.min(...ks, goal || Infinity)
  const hi = Math.max(...ks, goal || -Infinity)
  const min = lo - 0.5,
    max = hi + 0.5
  const span = max - min || 1
  const W = 320,
    H = 90
  const pts = data.map((e, i) => [
    (i / Math.max(1, data.length - 1)) * W,
    H - 10 - ((e.kg - min) / span) * (H - 24),
  ])
  const line = pts.map(p => p.join(',')).join(' ')
  const goalY = goal ? H - 10 - ((goal - min) / span) * (H - 24) : null
  const last = data[data.length - 1]
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="spark">
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="var(--accent)" />
        ))}
        {goal && (
          <>
            <line
              x1="0"
              x2={W}
              y1={goalY}
              y2={goalY}
              stroke="var(--dim)"
              strokeWidth="1.5"
              strokeDasharray="5 5"
            />
            <text x={W - 2} y={goalY - 4} textAnchor="end" fontSize="10" fill="var(--dim)">
              目标 {goal}kg
            </text>
          </>
        )}
      </svg>
      <div className="row-between dim small">
        <span>{fmtDate(data[0].t ?? data[0].d)}</span>
        <span>
          {data.length} 次记录
          {goal ? (last.kg <= goal ? ' · 🎉 已达目标' : ` · 距目标 ${(last.kg - goal).toFixed(1)}kg`) : ''}
        </span>
        <span>现在 {last.kg} kg</span>
      </div>
    </div>
  )
}
