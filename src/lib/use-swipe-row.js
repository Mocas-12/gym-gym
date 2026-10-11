import { useRef, useState } from 'react'

/* 行内横向滑动手势：左滑过阈值触发 onLeft（删除），右滑触发 onRight（复制）。
 * 垂直滚动不锁定（只有横向位移占优时才接管），CSS 侧配 touch-action: pan-y。 */
export function useSwipeRow({ onLeft, onRight, threshold = 72 } = {}) {
  const st = useRef({ x: 0, y: 0, locked: false })
  const [dx, setDx] = useState(0)

  const onTouchStart = e => {
    const t = e.touches[0]
    st.current = { x: t.clientX, y: t.clientY, locked: false }
  }
  const onTouchMove = e => {
    const t = e.touches[0]
    const mx = t.clientX - st.current.x
    const my = t.clientY - st.current.y
    if (!st.current.locked) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
      st.current.locked = Math.abs(mx) > Math.abs(my) * 1.2
    }
    if (st.current.locked) setDx(mx)
  }
  const onTouchEnd = () => {
    if (st.current.locked) {
      if (dx < -threshold) onLeft?.()
      else if (dx > threshold) onRight?.()
    }
    setDx(0)
  }

  return { dx, dragging: st.current.locked && dx !== 0, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } }
}
