import { useSwipeRow } from '../lib/use-swipe-row.js'

/* 一组：重量 × 次数 + 完成勾。触屏上左滑删除、右滑复制（带底色提示）。
 * 点组号切换热身组（不计容量/PR）；RIR 芯片点按循环 4→0 记录力竭余力。 */
const RIR_COLOR = { 0: 'r0', 1: 'r1' }
export default function SetRow({ idx, set: s, type, showRir, onDone, onDel, onCopy, onUpdate, onToggleWarmup }) {
  const { dx, dragging, handlers } = useSwipeRow({ onLeft: onDel, onRight: onCopy })
  const cycleRir = () => onUpdate({ rir: s.rir == null ? 4 : s.rir > 0 ? s.rir - 1 : null })

  return (
    <div className="swipe-wrap">
      <div className={'swipe-bg left' + (dx < -20 ? ' show' : '')}><span>🗑 删除</span></div>
      <div className={'swipe-bg right' + (dx > 20 ? ' show' : '')}><span>⧉ 复制</span></div>
      <div className={'set-row' + (s.done ? ' done' : '') + (dragging ? ' dragging' : '')}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        {...handlers}>
        <button
          className={'set-n-btn' + (s.w ? ' warm' : '')}
          title="点按切换热身组"
          onClick={onToggleWarmup}
        >{s.w ? '热' : idx + 1}</button>
        <input
          className="input set-input" inputMode="decimal"
          placeholder={type === 'time' ? '秒' : 'kg'}
          value={s.kg ?? ''}
          onChange={e => onUpdate({ kg: e.target.value === '' ? null : parseFloat(e.target.value) })}
        />
        <span className="x">×</span>
        <input
          className="input set-input" inputMode="numeric"
          placeholder={type === 'time' ? '速度' : '次数'}
          value={s.reps ?? ''}
          onChange={e => onUpdate({ reps: e.target.value === '' ? null : parseInt(e.target.value) })}
        />
        {showRir && s.done && (
          <button className={'rir-chip' + (RIR_COLOR[s.rir] || '') + (s.rir == null ? ' empty' : '')}
            title="RIR：力竭前还剩几次余力。R0=力竭"
            onClick={cycleRir}>{s.rir == null ? 'R' : `R${s.rir}`}</button>
        )}
        <button className={'done-btn' + (s.done ? ' on' : '')} onClick={onDone}>✓</button>
        <button className="icon-btn desktop-only" onClick={onDel}>🗑</button>
      </div>
    </div>
  )
}
