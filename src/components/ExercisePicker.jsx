import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { MUSCLES, EQUIPMENT } from '../data/exercises.js'

/* 底部抽屉：器械筛选 + 按肌群分组 + 搜索，多点几个连续加动作。 */
export default function ExercisePicker({ onAdd }) {
  const allEx = useStore(s => s.allEx)
  const custom = useStore(s => s.customEx)
  const addCustomEx = useStore(s => s.addCustomEx)
  const toast = useUI(s => s.toast)
  const [q, setQ] = useState('')
  const [eq, setEq] = useState(null)
  const [added, setAdded] = useState([])
  const list = allEx()
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return MUSCLES.map(m => ({
      m,
      items: list.filter(e =>
        e.m === m && (!eq || e.eq === eq) &&
        (!t || e.n.toLowerCase().includes(t) || e.id.includes(t))
      ),
    })).filter(g => g.items.length)
  }, [q, eq, list, custom])

  const add = ex => {
    if (onAdd(ex) !== false) setAdded(a => [...a, ex.n])
  }
  const addCustom = () => {
    const n = q.trim()
    if (!n) return
    addCustomEx({ n })
    toast(`已创建自定义练习「${n}」`)
    setQ('')
  }

  return (
    <div className="sheet-mask" onClick={() => onAdd(null, added)}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <input
            className="input grow"
            placeholder="搜索练习，或输入新名字回车创建"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && q.trim() && !shown.some(g => g.items.length)) addCustom() }}
          />
          <button className="btn primary" onClick={() => onAdd(null, added)}>完成{added.length ? `(${added.length})` : ''}</button>
        </div>
        <div className="eq-filter">
          <button className={'chip sm' + (eq === null ? ' on' : '')} onClick={() => setEq(null)}>全部</button>
          {EQUIPMENT.map(x => (
            <button key={x} className={'chip sm' + (eq === x ? ' on' : '')} onClick={() => setEq(eq === x ? null : x)}>{x}</button>
          ))}
        </div>
        <div className="sheet-body">
          {shown.length === 0 && q.trim() && (
            <button className="btn ghost block" onClick={addCustom}>＋ 创建自定义练习「{q.trim()}」</button>
          )}
          {shown.map(g => (
            <div key={g.m}>
              <div className="group-title">{g.m}</div>
              {g.items.map(ex => (
                <button key={ex.id} className={'pick' + (added.includes(ex.n) ? ' picked' : '')} onClick={() => add(ex)}>
                  <span>{ex.n}</span>
                  <span className="pick-eq">{ex.eq}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
