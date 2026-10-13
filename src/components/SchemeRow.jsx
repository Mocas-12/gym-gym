/* 组×次@重量 快捷方案：一行填「4 × 12 @ 12」批量生成组，替代逐组添加 */
import { useState } from 'react'

export default function SchemeRow({ onApply, kgLabel = 'kg' }) {
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [kg, setKg] = useState('')

  const apply = () => {
    const n = parseInt(sets),
      r = parseInt(reps),
      w = parseFloat(kg)
    if (!(n > 0 && n <= 30 && r > 0 && r <= 500)) return
    onApply(n, r, Number.isFinite(w) ? w : 0)
    setSets('')
    setReps('')
    setKg('')
  }

  return (
    <div className="scheme-row">
      <input
        className="input scheme-in"
        inputMode="numeric"
        placeholder="组"
        value={sets}
        onChange={e => setSets(e.target.value)}
      />
      <span className="scheme-x">×</span>
      <input
        className="input scheme-in"
        inputMode="numeric"
        placeholder="次"
        value={reps}
        onChange={e => setReps(e.target.value)}
      />
      <span className="scheme-x">@</span>
      <input
        className="input scheme-in"
        inputMode="decimal"
        placeholder={kgLabel}
        value={kg}
        onChange={e => setKg(e.target.value)}
      />
      <button className="btn ghost sm" onClick={apply}>
        生成
      </button>
    </div>
  )
}
