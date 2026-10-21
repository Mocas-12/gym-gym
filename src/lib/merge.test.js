import { expect, it } from 'vitest'
import { mergeDocuments, fingerprints, chooseConflicts, sameFingerprints } from './merge.js'

it('新增、单方修改与删除对四类记录一致生效', async () => {
  for (const [key, id] of Object.entries({
    workouts: 'id',
    routines: 'id',
    customEx: 'id',
    bodyweight: 'd',
  })) {
    const original = {
      [key]: [
        { [id]: 'old', name: 'before' },
        { [id]: 'edit', name: 'before' },
      ],
    }
    const base = await fingerprints(original)
    const local = { [key]: [{ [id]: 'edit', name: 'after' }] }
    const remote = { [key]: [...original[key], { [id]: 'new' }] }
    const result = await mergeDocuments(local, remote, base)
    expect(result.conflicts).toEqual([])
    expect(result.merged[key]).toEqual([{ [id]: 'edit', name: 'after' }, { [id]: 'new' }])
  }
})

it('删除与编辑同一记录需要选择，选择后仍保留其他独立行', async () => {
  const base = await fingerprints({ workouts: [{ id: 'x', name: 'before' }] })
  const result = await mergeDocuments(
    { workouts: [{ id: 'local' }] },
    { workouts: [{ id: 'x', name: 'after' }, { id: 'remote' }] },
    base
  )
  expect(result.conflicts).toHaveLength(1)
  expect(chooseConflicts(result, 'local').workouts.map(w => w.id)).toEqual(['local', 'remote'])
  expect(chooseConflicts(result, 'remote').workouts.map(w => w.id)).toEqual(['local', 'remote', 'x'])
})

it('摘要不受字段顺序和 PR 派生值影响', async () => {
  const a = await fingerprints({
    workouts: [{ id: 'w', start: 1, volume: 100, prs: [] }],
    settings: { a: 1, b: 2 },
  })
  const b = await fingerprints({ settings: { b: 2, a: 1 }, workouts: [{ start: 1, id: 'w', volume: 200 }] })
  expect(sameFingerprints(a, b)).toBe(true)
})

it('旧记录缺 id 时也不会被合并丢失', async () => {
  const result = await mergeDocuments({ workouts: [{ name: 'a' }] }, { workouts: [{ name: 'b' }] })
  expect(result.merged.workouts).toHaveLength(2)
})

it('特殊字符串 id 被视为普通记录', async () => {
  const result = await mergeDocuments(
    { workouts: [{ id: '__proto__', name: 'local' }] },
    { workouts: [{ id: 'constructor', name: 'remote' }] }
  )
  expect(result.merged.workouts).toHaveLength(2)
  expect(result.conflicts).toHaveLength(0)
})
