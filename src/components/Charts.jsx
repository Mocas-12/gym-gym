/* 洞察图表：全年热力图（GitHub 风格）、1RM 折线、肌群恢复条。纯展示，数据来自 lib/insights.js */

const VOL_LEVELS = [0, 1000, 3000, 6000] // 容量分档阈值 kg

export function Heatmap({ data }) {
  // data: [{d, v}] 时间升序 → 排成 周一为首行的 7×N 列
  const cols = []
  let col = Array(7).fill(null)
  data.forEach((x, i) => {
    const dow = (new Date(x.d + 'T12:00:00').getDay() + 6) % 7 // 周一=0
    col[dow] = x
    if (dow === 6 || i === data.length - 1) { cols.push(col); col = Array(7).fill(null) }
  })
  const level = v => (v <= 0 ? 0 : VOL_LEVELS.findIndex(t => v < t) === -1 ? 4 : VOL_LEVELS.findIndex(t => v < t))
  return (
    <div className="hm-scroll">
      <div className="hm">
        {cols.map((c, ci) => (
          <div className="hm-col" key={ci}>
            {c.map((x, ri) => (
              <div key={ri} className={'hm-cell' + (x && x.v > 0 ? ` l${level(x.v)}` : '')}
                title={x ? `${x.d} · ${x.v}kg` : ''} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function LineChart({ data, unit = 'kg' }) {
  // data: [{t, v}] 升序
  if (!data || data.length < 2) return <p className="dim small">至少两次训练后出曲线。</p>
  const W = 320, H = 110, pad = 8
  const vs = data.map(x => x.v)
  const min = Math.min(...vs), max = Math.max(...vs)
  const span = max - min || 1
  const pts = data.map((x, i) => [pad + (i / (data.length - 1)) * (W - pad * 2), H - pad - ((x.v - min) / span) * (H - pad * 2)])
  const line = pts.map(p => p.join(',')).join(' ')
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="spark">
        <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="var(--accent)" />)}
      </svg>
      <div className="row-between dim small mono">
        <span>{data[0].v}{unit}</span>
        <span>{data.length} 次记录</span>
        <span className="accent">{vs[vs.length - 1]}{unit} · 最佳 {max}{unit}</span>
      </div>
    </div>
  )
}

export function RecoveryList({ items }) {
  if (!items.length) return <p className="dim small">近 7 天还没有训练记录。</p>
  return (
    <div>
      {items.map(x => (
        <div key={x.m} className="rec-row">
          <span className="rec-m">{x.m}</span>
          <div className="rec-bar">
            <i style={{ width: x.pct + '%' }} className={x.recovered ? 'ok' : ''} />
          </div>
          <span className={'rec-tag' + (x.recovered ? ' ok' : '')}>
            {x.recovered ? '已恢复' : `恢复中 ${x.pct}%`}
          </span>
          <span className="dim small mono rec-sets">{x.sets}组</span>
        </div>
      ))}
    </div>
  )
}
