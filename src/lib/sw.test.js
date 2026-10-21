import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

it('更新 SW 只删除 GymGym 的旧缓存，保留同源其他应用的数据', async () => {
  const handlers = {}
  const caches = {
    keys: async () => ['gym-gym-v2', 'gym-gym-v3', 'other-app-v1'],
    delete: vi.fn().mockResolvedValue(true),
  }
  runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), {
    self: {
      addEventListener: (name, fn) => {
        handlers[name] = fn
      },
      clients: { claim: async () => {} },
    },
    caches,
  })
  let completion
  handlers.activate({
    waitUntil: promise => {
      completion = promise
    },
  })
  await completion
  expect(caches.delete.mock.calls).toEqual([['gym-gym-v2']])
})
