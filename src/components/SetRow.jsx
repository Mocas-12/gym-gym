import { useSwipeRow } from '../lib/use-swipe-row.js'

/* 一组：按动作类型渲染输入（力量 kg×次 / 计时 秒 / 有氧 分-速-坡）。
 * 触屏左滑删除、右滑复制；点组号切换热身组；RIR 芯片记录力竭余力。 */
const RIR_COLOR = { 0: 'r0', 1: 'r1' }

export default function SetRow({ idx, set: s, type, showRir, onDone, onDel, onCopy, onUpdate, onToggleWarmup }) {
  const { dx, dragging, handlers } = useSwipeRow({ onLeft: onDel, onRight: onCopy })
  const cycleRir = () => onUpdate({ rir: s.rir == null ? 4 : s.rir > 0 ? s.rir - 1 : null })
  const num = (field, placeholder, mode = 'decimal') => (
    <input
      className="input set-input" inputMode={mode}
      placeholder={placeholder}
      value={s[field] ?? ''}
      onChange={e => onUpdate({ [field]: e.target.value === '' ? null : parseFloat(e.target.value) })}
    />
  )

  return (
    <div className="swipe-wrap">
      <div className={'swipe-bg left' + (dx < -20 ? ' show' : '')}><span>🗑 删除</span></div>
      <div className={'swipe-bg right' + (dx > 20 ? ' show' : '')}><span>⧉ 复制</span></div>
      <div className={'set-row' + (s.done ? ' done' : '') + (dragging ? ' dragging' : '') + (type === 'cardio' ? ' cardio' : type === 'time' ? ' time' : '')}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        {...handlers}>
        <button
          className={'set-n-btn' + (s.w ? ' warm' : '')}
          title="点按切换热身组"
          onClick={onToggleWarmup}
        >{s.w ? '热' : idx + 1}</button>

        {type === 'cardio' ? (
          <>
            {num('min', '分钟', 'numeric')}
            <span className="x">分</span>
            {num('speed', '速度')}
            <span className="x">km/h</span>
            {num('incl', '坡度')}
          </>
        ) : type === 'time' ? (
          <>
            {num('sec', '秒', 'numeric')}
            <span className="x">秒</span>
          </>
        ) : (
          <>
            {num('kg', 'kg')}
            <span className="x">×</span>
            {num('reps', '次数', 'numeric')}
          </>
        )}

        {showRir && s.done && type !== 'cardio' && type !== 'time' && (
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
