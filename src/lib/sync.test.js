import { afterEach, expect, it, vi } from 'vitest'
import { pullData } from './sync.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('断网返回可显示的错误，不抛出未处理异常', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  expect(await pullData('https://test.invalid', 'token')).toMatchObject({
    ok: false,
    status: 0,
    data: { error: expect.stringContaining('无法连接') },
  })
})
it('服务器无响应时 15 秒中止，允许用户重试', async () => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
  )
  const request = pullData('https://test.invalid', 'token')
  await vi.advanceTimersByTimeAsync(15000)
  expect(await request).toMatchObject({ ok: false, status: 0 })
})
