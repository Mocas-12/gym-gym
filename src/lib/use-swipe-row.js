// @ts-check
import { useRef, useState } from 'react'

/* 行内横向滑动手势：左滑过阈值触发 onLeft（删除），右滑触发 onRight（复制）。
 * 垂直滚动不锁定（只有横向位移占优时才接管），CSS 侧配 touch-action: pan-y。 */

/**
 * @param {{ onLeft?: () => void, onRight?: () => void, threshold?: number }} [opts]
 * @returns {{ dx: number, dragging: boolean, handlers: { onTouchStart: (e: React.TouchEvent) => void, onTouchMove: (e: React.TouchEvent) => void, onTouchEnd: () => void, onTouchCancel: () => void } }}
 */
export function useSwipeRow({ onLeft, onRight, threshold = 72 } = {}) {
  /** @type {React.RefObject<{ x: number, y: number }>} */
  const st = useRef({ x: 0, y: 0 })
  const [dx, setDx] = useState(0)
  // 锁定态用 state 镜像（渲染期可读）；ref 里的 x/y 只在事件处理器里读写
  const [locked, setLocked] = useState(false)

  /** @param {React.TouchEvent} e */
  const onTouchStart = e => {
    const t = e.touches[0]
    st.current = { x: t.clientX, y: t.clientY }
    setLocked(false)
  }
  /** @param {React.TouchEvent} e */
  const onTouchMove = e => {
    const t = e.touches[0]
    const mx = t.clientX - st.current.x
    const my = t.clientY - st.current.y
    if (!locked) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
      if (!(Math.abs(mx) > Math.abs(my) * 1.2)) return
      setLocked(true)
    }
    setDx(mx)
  }
  const onTouchEnd = () => {
    if (locked) {
      if (dx < -threshold) onLeft?.()
      else if (dx > threshold) onRight?.()
    }
    setDx(0)
  }

  return {
    dx,
    dragging: locked && dx !== 0,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  }
}
