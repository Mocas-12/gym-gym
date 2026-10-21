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

it.each([false, true])('可见页面只有确认接管计时才抑制推送（handled=%s）', async handled => {
  const handlers = {},
    showNotification = vi.fn()
  class Channel {
    constructor() {
      this.port1 = { close() {}, onmessage: null }
      this.port2 = { reply: data => this.port1.onmessage({ data }) }
    }
  }
  runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), {
    self: {
      addEventListener: (name, fn) => {
        handlers[name] = fn
      },
      clients: {
        matchAll: async () => [
          { visibilityState: 'visible', postMessage: (_data, ports) => ports[0].reply({ handled }) },
        ],
      },
      registration: { showNotification },
    },
    MessageChannel: Channel,
    setTimeout,
    clearTimeout,
  })
  let completion
  handlers.push({
    data: { json: () => ({ restId: 'rest', title: '结束' }) },
    waitUntil: p => {
      completion = p
    },
  })
  await completion
  expect(showNotification).toHaveBeenCalledTimes(handled ? 0 : 1)
})

it('可见但无响应的页面不能吞掉休息推送', async () => {
  vi.useFakeTimers()
  try {
    const handlers = {},
      showNotification = vi.fn()
    runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), {
      self: {
        addEventListener: (name, fn) => {
          handlers[name] = fn
        },
        clients: { matchAll: async () => [{ visibilityState: 'visible', postMessage() {} }] },
        registration: { showNotification },
      },
      MessageChannel: class {
        port1 = { close() {} }
        port2 = {}
      },
      setTimeout,
      clearTimeout,
    })
    let completion
    handlers.push({
      data: { json: () => ({ restId: 'rest' }) },
      waitUntil: p => {
        completion = p
      },
    })
    await vi.advanceTimersByTimeAsync(800)
    await completion
    expect(showNotification).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
  }
})
