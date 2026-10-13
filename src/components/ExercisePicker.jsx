/* 动作选择器（受控组件）：选中态由父组件传入，点按 = 切换（选中/取消）。
 * Portal 渲染到 body（不被抽屉遮挡）；键盘弹出时整体上移避让。 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { MUSCLES, EQUIPMENT } from '../data/exercises.js'

export default function ExercisePicker({ selected = [], onToggle, onClose }) {
  const allEx = useStore(s => s.allEx)
  const custom = useStore(s => s.customEx)
  const addCustomEx = useStore(s => s.addCustomEx)
  const toast = useUI(s => s.toast)
  const [q, setQ] = useState('')
  const [eq, setEq] = useState(null)
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

  /* 键盘避让：visualViewport 缩小时把整个抽屉上移同样高度 */
  const [kb, setKb] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const on = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on) }
  }, [])

  const addCustom = () => {
    const n = q.trim()
    if (!n) return
    const ex = addCustomEx({ n })
    toast(`已创建自定义练习「${n}」`)
    setQ('')
    onToggle(ex)
  }

  return createPortal(
    <div className="sheet-mask" onClick={onClose}>
      <div
        className="sheet"
        style={kb > 80 ? { transform: `translateY(-${kb}px)` } : undefined}
        onClick={e => e.stopPropagation()}
      >
        <div className="sheet-head">
          <input
            className="input grow"
            placeholder="搜索练习，或输入新名字回车创建"
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && q.trim() && !shown.some(g => g.items.length)) addCustom() }}
          />
          <button className="icon-btn" title="关闭" onClick={onClose}>✕</button>
          <button className="btn primary" onClick={onClose}>完成{selected.length ? `(${selected.length})` : ''}</button>
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
                <button key={ex.id} className={'pick' + (selected.includes(ex.id) ? ' picked' : '')} onClick={() => onToggle(ex)}>
                  <span>{ex.n}</span>
                  <span className="pick-eq">{selected.includes(ex.id) ? '✓ 已选' : ex.eq}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
