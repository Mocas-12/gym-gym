import { useSwipeRow } from '../lib/use-swipe-row.js'

/* 一组：重量 × 次数 + 完成勾。触屏上左滑删除、右滑复制（带底色提示）。 */
export default function SetRow({ idx, set: s, type, onDone, onDel, onCopy, onUpdate }) {
  const { dx, dragging, handlers } = useSwipeRow({ onLeft: onDel, onRight: onCopy })

  return (
    <div className="swipe-wrap">
      <div className={'swipe-bg left' + (dx < -20 ? ' show' : '')}><span>🗑 删除</span></div>
      <div className={'swipe-bg right' + (dx > 20 ? ' show' : '')}><span>⧉ 复制</span></div>
      <div className={'set-row' + (s.done ? ' done' : '') + (dragging ? ' dragging' : '')}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        {...handlers}>
        <span className="set-n">{idx + 1}</span>
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
        <button className={'done-btn' + (s.done ? ' on' : '')} onClick={onDone}>✓</button>
        <button className="icon-btn desktop-only" onClick={onDel}>🗑</button>
      </div>
    </div>
  )
}
