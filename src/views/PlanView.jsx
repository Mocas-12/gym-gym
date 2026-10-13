import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { rotationNext, DISPLAY_DAYS, WEEKDAY_CN } from '../lib/plan.js'
import RoutineEdit, { cfgLabel } from '../components/RoutineEdit.jsx'

/* 计划页：每周固定排课 / 顺序轮换 两种模式 + 模板管理入口 */
export default function PlanView() {
  const { plan, routines, workouts, setPlanMode, assignDay, setRotation } = useStore()
  const [editing, setEditing] = useState(null)

  const byId = id => routines.find(r => r.id === id)
  const nameOf = id => byId(id)?.name || id
  const nextRot = plan.mode === 'rotation' ? rotationNext(plan.rotation, workouts) : null

  const moveRot = (i, dir) => {
    const rot = [...plan.rotation]
    const j = i + dir
    if (j < 0 || j >= rot.length) return
    ;[rot[i], rot[j]] = [rot[j], rot[i]]
    setRotation(rot)
  }

  return (
    <div className="page">
      <h1 className="h1">计划</h1>

      <div className="card">
        <div className="row" style={{ marginTop: 0 }}>
          <button
            className={'chip grow' + (plan.mode === 'week' ? ' on' : '')}
            onClick={() => setPlanMode('week')}
          >
            每周固定
          </button>
          <button
            className={'chip grow' + (plan.mode === 'rotation' ? ' on' : '')}
            onClick={() => setPlanMode('rotation')}
          >
            顺序轮换
          </button>
        </div>
        <p className="dim small" style={{ marginTop: 10 }}>
          {plan.mode === 'week'
            ? '按星期几排课：到了那天，首页会显示今天该练什么。'
            : '不按星期：每次练完，下一个自动排上来，适合不固定的作息。'}
        </p>
      </div>

      {plan.mode === 'week' ? (
        <div className="card">
          {DISPLAY_DAYS.map(d => (
            <div key={d} className="plan-day">
              <span className={'plan-dow' + (d === new Date().getDay() ? ' today' : '')}>
                {WEEKDAY_CN[d]}
              </span>
              <div className="plan-chips">
                <button
                  className={'chip sm' + (!plan.week?.[d] ? ' on' : '')}
                  onClick={() => assignDay(d, null)}
                >
                  休息
                </button>
                {routines.map(r => (
                  <button
                    key={r.id}
                    className={'chip sm' + (plan.week?.[d] === r.id ? ' on' : '')}
                    onClick={() => assignDay(d, r.id)}
                  >
                    {r.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          {plan.rotation.length === 0 && <p className="dim small">轮换列表是空的，从下面加模板进来。</p>}
          {plan.rotation.map((rid, i) => (
            <div key={rid} className="rot-row">
              <span className="rot-n">{i + 1}</span>
              <span className="grow">{nameOf(rid)}</span>
              {nextRot === rid && <span className="accent small">下一个</span>}
              <button className="icon-btn" onClick={() => moveRot(i, -1)}>
                ↑
              </button>
              <button className="icon-btn" onClick={() => moveRot(i, 1)}>
                ↓
              </button>
              <button className="icon-btn" onClick={() => setRotation(plan.rotation.filter(x => x !== rid))}>
                ✕
              </button>
            </div>
          ))}
          <div className="plan-chips" style={{ marginTop: 8 }}>
            {routines
              .filter(r => !plan.rotation.includes(r.id))
              .map(r => (
                <button key={r.id} className="chip sm" onClick={() => setRotation([...plan.rotation, r.id])}>
                  ＋ {r.name.split(' ')[0]}
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="section-title">训练模板</div>
      {routines.map(r => (
        <button key={r.id} className="card card-open" onClick={() => setEditing(r.id)}>
          <div className="row-between">
            <div>
              <div className="card-title">{r.name}</div>
              <div className="dim small">
                {r.exIds.length} 个动作 · {cfgLabel(r.cfg)}
                {r.supersets?.length ? ` · ${r.supersets.length} 组超级组` : ''}
              </div>
            </div>
            <span className="chev">›</span>
          </div>
        </button>
      ))}

      {editing && <RoutineEdit id={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
