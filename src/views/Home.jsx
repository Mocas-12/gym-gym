import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import RestTimer from '../components/RestTimer.jsx'
import { workoutVolume } from '../lib/workout.js'
import { todayPlan, nextAssigned, WEEKDAY_CN } from '../lib/plan.js'

const fmtDate = ts => {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
const fmtDur = ms => {
  const m = Math.round(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}小时${m % 60}分` : `${m}分钟`
}

export default function Home() {
  const { workouts, bodyweight, routines, active, plan } = useStore()
  const { startWorkout, logBodyweight } = useStore()
  const { startRest, toast } = useUI()
  const go = r => { location.hash = '#/' + r }

  const last = workouts[0]
  const todayW = bodyweight[0]
  const week = bodyweight.slice(0, 7)

  /* 今天的安排：week 模式按星期、rotation 模式按顺序 */
  const todayRid = todayPlan(plan, workouts)
  const todayRoutine = routines.find(r => r.id === todayRid)
  const restHint = !todayRoutine ? nextAssigned(plan, workouts) : null
  const restHintName = restHint ? routines.find(r => r.id === restHint.rid)?.name : null
  const dow = new Date().getDay()

  const begin = (name, ids, rid = null) => {
    if (active) { toast('有一次训练还在进行中'); go('workout'); return }
    startWorkout(name, ids, rid)
    go('workout')
  }

  return (
    <div className="page">
      <RestTimer />
      <h1 className="h1">GymGym</h1>
      <p className="sub">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p>

      {active && (
        <button className="card active-card" onClick={() => go('workout')}>
          <div>
            <div className="card-title">▲ {active.name} 进行中</div>
            <div className="dim">{active.entries.length} 个动作 · 开始于 {new Date(active.start).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <span className="chev">›</span>
        </button>
      )}

      <div className="section-title">今天的安排</div>
      {todayRoutine ? (
        <button className="card today-card" onClick={() => begin(todayRoutine.name, todayRoutine.exIds, todayRoutine.id)}>
          <div className="row-between">
            <div>
              <div className="card-title">{todayRoutine.name}</div>
              <div className="dim small">{todayRoutine.exIds.length} 个动作 · {WEEKDAY_CN[dow]}</div>
            </div>
            <span className="btn primary sm">开练</span>
          </div>
        </button>
      ) : (
        <div className="card rest-card">
          <div className="card-title">🙂 今天休息</div>
          {restHintName
            ? <div className="dim small">{plan.mode === 'rotation' ? `下一个：${restHintName}` : `${restHint.inDays === 0 ? '下一个就是今天，在轮换里' : restHint.inDays + ' 天后（' + WEEKDAY_CN[(dow + restHint.inDays) % 7] + '）：'}${restHintName}`}</div>
            : <div className="dim small">还没排课，去「计划」标签安排一周训练。</div>}
        </div>
      )}

      <div className="section-title">全部模板</div>
      <div className="start-grid">
        {routines.map(r => (
          <button key={r.id} className="card start-card" onClick={() => begin(r.name, r.exIds, r.id)}>
            <div className="card-title">{r.name}</div>
            <div className="dim">{r.exIds.length} 个动作</div>
          </button>
        ))}
        <button className="card start-card" onClick={() => begin('自由训练', [])}>
          <div className="card-title">＋ 自由训练</div>
          <div className="dim">进去再加动作</div>
        </button>
      </div>

      <div className="section-title">今日体重</div>
      <div className="card">
        {todayW ? (
          <div className="row-between">
            <span className="big-num">{todayW.kg}<small> kg</small></span>
            <span className="dim">已记录 · 点右侧更新</span>
          </div>
        ) : null}
        <form className="row" onSubmit={e => {
          e.preventDefault()
          const v = parseFloat(new FormData(e.currentTarget).get('kg'))
          if (v > 20 && v < 300) { logBodyweight(v); toast('已记录体重') }
        }}>
          <input name="kg" className="input" inputMode="decimal" placeholder={todayW ? '更新为…' : '输入今天体重 (kg)'} />
          <button className="btn primary">记录</button>
        </form>
        {week.length > 1 && (
          <Sparkline data={[...week].reverse().map(e => e.kg)} />
        )}
      </div>

      {last && (
        <>
          <div className="section-title">上次训练</div>
          <button className="card" onClick={() => go('history')}>
            <div className="row-between">
              <div>
                <div className="card-title">{last.name}</div>
                <div className="dim">{fmtDate(last.start)} · {fmtDur(last.end - last.start)}</div>
              </div>
              <div className="right-align">
                <div className="big-num sm">{(last.volume / 1000).toFixed(1)}<small>t</small></div>
                <div className="dim">{workoutVolume(last) ? '总容量' : ''}</div>
              </div>
            </div>
          </button>
        </>
      )}
    </div>
  )
}

function Sparkline({ data: raw }) {
  const data = (raw || []).filter(v => Number.isFinite(v))
  if (data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const span = max - min || 1
  const W = 300, H = 56
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 6 - ((v - min) / span) * (H - 12)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
