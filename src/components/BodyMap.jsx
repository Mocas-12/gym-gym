import { useEffect, useState } from 'react'
import { INERT, MUSCLE_ZH } from '../lib/muscles.js'

/* 正面 + 背面人体图：轮廓中性色，各肌群按 levels[slug]（0–4）着色，
 * 色阶与训练热力图同一套绿。几何数据 ~42KB，懒加载（加载中保留占位高度防跳动）。 */

let CACHE = null
let PENDING = null

function useBodyPaths() {
  const [paths, setPaths] = useState(CACHE)
  useEffect(() => {
    if (CACHE) return
    let alive = true
    PENDING = PENDING || import('../data/body-paths.json').then(m => (CACHE = m.default))
    PENDING.then(p => {
      if (alive) setPaths(p)
    }).catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return paths
}

function View({ view, levels }) {
  return (
    <svg className="bm-v" viewBox={view.vb} role="img">
      {INERT.map(slug =>
        (view.p[slug] || []).map((d, i) => <path key={slug + i} className="bm-sil" d={d} />)
      )}
      {Object.entries(view.p).map(([slug, ds]) =>
        INERT.includes(slug)
          ? null
          : ds.map((d, i) => (
              <path key={slug + i} className={'bm-m l' + (levels[slug] || 0)} d={d}>
                <title>{MUSCLE_ZH[slug] || slug}</title>
              </path>
            ))
      )}
    </svg>
  )
}

export default function BodyMap({ levels }) {
  const paths = useBodyPaths()
  if (!paths) return <div className="bm-holder" />
  return (
    <div className="bm-wrap">
      <View view={paths.front} levels={levels} />
      <View view={paths.back} levels={levels} />
    </div>
  )
}
