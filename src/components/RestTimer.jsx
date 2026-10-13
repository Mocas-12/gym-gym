import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'

const fmt = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* 底部休息倒计时条：训练页之外的页面也显示，完场自动蜂鸣+震动。 */
export default function RestTimer() {
  const { restUntil, restLabel, addRest, stopRest, finishRest } = useUI()
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!restUntil) {
      setLeft(0)
      return
    }
    const tm = setInterval(() => {
      const ms = restUntil - Date.now()
      if (ms <= 0) finishRest()
      else setLeft(ms)
    }, 200)
    return () => clearInterval(tm)
  }, [restUntil, finishRest])

  if (!restUntil) return null
  return (
    <div className="restbar">
      <div className="rest-num">{fmt(left)}</div>
      <div className="rest-label">{restLabel || '休息'}</div>
      <div className="rest-btns">
        <button className="btn ghost sm" onClick={() => addRest(30)}>
          +30s
        </button>
        <button className="btn ghost sm" onClick={stopRest}>
          跳过
        </button>
      </div>
    </div>
  )
}
