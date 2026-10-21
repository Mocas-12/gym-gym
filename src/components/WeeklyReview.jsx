import { useState } from 'react'
import { weeklyReview } from '../lib/review.js'

export default function WeeklyReview({ workouts }) {
  const [offset, setOffset] = useState(0)
  const review = weeklyReview(workouts, new Date(), offset)
  const { current: c, previous: p } = review
  const delta = value => `${value > 0 ? '+' : ''}${value}`
  return (
    <>
      <div className="section-title">训练周回顾</div>
      <div className="card">
        <div className="row-between">
          <button className="chip" onClick={() => setOffset(offset - 1)}>
            上一周
          </button>
          <span className="small mono">
            {review.from} ～ {review.to}
          </span>
          <button className="chip" disabled={offset === 0} onClick={() => setOffset(offset + 1)}>
            下一周
          </button>
        </div>
        <p>
          {c.sessions} 次训练 · {c.days} 天 · {c.sets} 个正式组
        </p>
        <p className="small">
          力量容量 {Math.round(c.volume)} kg · 训练用时 {c.minutes} 分钟 · {c.prs} 个 PR
        </p>
        {(c.timedSeconds > 0 || c.cardioMinutes > 0) && (
          <p className="small">
            计时动作 {c.timedSeconds} 秒 · 有氧 {c.cardioMinutes} 分钟
          </p>
        )}
        <p className="dim small">
          较上周{offset === 0 ? '同期' : ''}：训练 {delta(c.sessions - p.sessions)} 次，正式组{' '}
          {delta(c.sets - p.sets)} 组，力量容量 {delta(Math.round(c.volume - p.volume))} kg。
        </p>
        {!c.sessions && <p className="dim small">这段时间还没有训练记录，完成训练后会自动生成回顾。</p>}
      </div>
    </>
  )
}
