export const DATA_KEYS = ['settings', 'customEx', 'routines', 'plan', 'workouts', 'bodyweight']
const collections = { customEx: 'id', routines: 'id', workouts: 'id', bodyweight: 'd' }
const stable = value =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .filter(k => v[k] !== undefined)
            .map(k => [k, v[k]])
        )
      : v
  )
export const sameFingerprints = (left, right) => stable(left) === stable(right)
const rows = (doc, key) =>
  collections[key]
    ? Object.assign(
        Object.create(null),
        Object.fromEntries(
          (doc[key] || []).map((r, i) => {
            // 兼容旧备份缺少 id 的记录：内容相同才合并，不能静默丢失。
            const id = r[collections[key]] ?? `legacy:${stable(r)}:${i}`
            const value =
              key === 'workouts'
                ? Object.fromEntries(Object.entries(r).filter(([k]) => !['volume', 'prs'].includes(k)))
                : r
            return [id, value]
          })
        )
      )
    : { value: doc[key] }

export async function fingerprints(doc) {
  const result = {}
  for (const key of DATA_KEYS) {
    result[key] = Object.create(null)
    for (const [id, value] of Object.entries(rows(doc, key))) {
      if (value === undefined) continue
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)))
      result[key][id] = [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('')
    }
  }
  return result
}

// 三方合并：未改的一方接受另一方修改；双方修改同一记录才需要选择。
export async function mergeDocuments(local, remote, base = {}) {
  const [lh, rh] = await Promise.all([fingerprints(local), fingerprints(remote)])
  const merged = {},
    conflicts = []
  for (const key of DATA_KEYS) {
    const left = rows(local, key),
      right = rows(remote, key),
      output = Object.create(null)
    for (const id of new Set([
      ...Object.keys(left),
      ...Object.keys(right),
      ...Object.keys(base[key] || {}),
    ])) {
      const l = lh[key][id],
        r = rh[key][id],
        b = Object.prototype.hasOwnProperty.call(base[key] || {}, id) ? base[key][id] : undefined
      let value
      if (l === r || r === b) value = left[id]
      else if (l === b) value = right[id]
      else if (!b && (!l || !r)) value = l ? left[id] : right[id]
      else {
        value = left[id]
        conflicts.push({ key, id, local: left[id], remote: right[id] })
      }
      if (value !== undefined) output[id] = value
    }
    merged[key] = collections[key] ? Object.values(output) : output.value
  }
  return { merged, conflicts, localHashes: lh, remoteHashes: rh }
}

export function chooseConflicts(result, choice) {
  const doc = structuredClone(result.merged)
  for (const conflict of result.conflicts) {
    const { key, id } = conflict,
      value = conflict[choice]
    if (!collections[key]) doc[key] = value
    else {
      const list = rows(doc, key)
      if (value === undefined) delete list[id]
      else list[id] = value
      doc[key] = Object.values(list)
    }
  }
  return doc
}
