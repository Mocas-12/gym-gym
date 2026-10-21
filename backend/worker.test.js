/* 微后端测试：直接导入部署使用的 backend/worker.js，
 * KV 用内存垫片，在 Node 的 WebCrypto 里完整验证同步、推送加密（RFC 8291 逆向解密）、
 * 速率限制与诊断上报。 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import * as api from './worker.js'
const enc = new TextEncoder()
const b64u = u8 =>
  Buffer.from(u8).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const makeEnv = () => {
  const store = new Map()
  const users = new Map()
  const env = {
    KV: {
      get: async k => (store.has(k) ? store.get(k) : null),
      put: async (k, v) => {
        store.set(k, String(v))
      },
      delete: async k => {
        store.delete(k)
      },
      _store: store,
    },
  }
  env.USERS = {
    idFromName: uid => uid,
    get: uid => {
      if (!users.has(uid)) {
        const data = new Map()
        let gate = Promise.resolve()
        let alarm = null
        const ctx = {
          storage: {
            get: async k => structuredClone(data.get(k)),
            put: async (k, v) => data.set(k, structuredClone(v)),
            delete: async k => data.delete(k),
            list: async ({ prefix }) =>
              new Map(
                [...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])
              ),
            getAlarm: async () => alarm,
            setAlarm: async at => {
              alarm = at
            },
            deleteAlarm: async () => {
              alarm = null
            },
          },
          blockConcurrencyWhile: fn => {
            const result = gate.then(fn)
            gate = result.catch(() => {})
            return result
          },
        }
        users.set(uid, { instance: new api.GymUser(ctx, env), ctx })
      }
      return users.get(uid).instance
    },
  }
  env._users = users
  return env
}
const req = (url, { method = 'GET', token = '', body, origin = 'https://mocas-12.github.io', ip } = {}) =>
  new Request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      origin,
      ...(ip ? { 'cf-connecting-ip': ip } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const call = (env, request) => api.default.fetch(request, env, {})

let TOKEN
const ENV = makeEnv()
const BASE = 'https://x.workers.dev'

describe('同步端点', () => {
  it('同一修订号的并发写入只有一个成功', async () => {
    const env = makeEnv()
    const { token } = await (
      await call(env, req(BASE + '/api/register', { method: 'POST', body: {}, ip: '198.51.100.20' }))
    ).json()
    const responses = await Promise.all(
      ['a', 'b'].map(id =>
        call(
          env,
          req(BASE + '/api/data', {
            method: 'PUT',
            token,
            body: { baseRev: 0, state: { workouts: [{ id, entries: [{ exId: 'x', sets: [] }] }] } },
          })
        )
      )
    )
    expect(responses.map(r => r.status).sort()).toEqual([200, 409])
  })
  it('旧 KV 文档只迁移一次，缺少 baseRev 不能覆盖', async () => {
    const env = makeEnv()
    const { token, uid } = await (
      await call(env, req(BASE + '/api/register', { method: 'POST', body: {}, ip: '198.51.100.21' }))
    ).json()
    await env.KV.put('state:' + uid, JSON.stringify({ _rev: 4, workouts: [] }))
    expect((await (await call(env, req(BASE + '/api/data', { token }))).json()).rev).toBe(4)
    expect(
      (await call(env, req(BASE + '/api/data', { method: 'PUT', token, body: { state: {} } }))).status
    ).toBe(400)
    await call(env, req(BASE + '/api/data', { method: 'DELETE', token }))
    env._users.get(uid).instance = new api.GymUser(env._users.get(uid).ctx, env)
    expect((await (await call(env, req(BASE + '/api/data', { token }))).json()).rev).toBe(5)
  })
  it('health 与注册', async () => {
    const h = await call(ENV, req(BASE + '/api/health'))
    expect(h.status).toBe(200)
    const r = await call(ENV, req(BASE + '/api/register', { method: 'POST', body: { name: 't' } }))
    const d = await r.json()
    expect(d.token).toMatch(/^\w+\.\w+$/)
    TOKEN = d.token
  })
  it('未认证 401', async () => {
    const r = await call(ENV, req(BASE + '/api/data'))
    expect(r.status).toBe(401)
  })
  it('PUT → GET 往返；baseRev 过期 409 带服务器文档', async () => {
    const p = await call(
      ENV,
      req(BASE + '/api/data', {
        method: 'PUT',
        token: TOKEN,
        body: {
          baseRev: 0,
          state: {
            workouts: [{ id: 1, entries: [{ exId: 'a', sets: [{ done: true }] }] }],
            settings: { restSec: 75 },
          },
        },
      })
    )
    expect((await p.json()).rev).toBe(1)
    const g = await call(ENV, req(BASE + '/api/data', { token: TOKEN }))
    expect((await g.json()).state.settings.restSec).toBe(75)
    const c = await call(
      ENV,
      req(BASE + '/api/data', { method: 'PUT', token: TOKEN, body: { baseRev: 0, state: { workouts: [] } } })
    )
    expect(c.status).toBe(409)
    const cd = await c.json()
    expect(cd.rev).toBe(1)
    expect(cd.state.workouts).toHaveLength(1)
  })
  it('PUT 净化：null/无效训练不入库', async () => {
    const r = await call(
      ENV,
      req(BASE + '/api/data', {
        method: 'PUT',
        token: TOKEN,
        body: {
          baseRev: 1,
          state: { workouts: [null, { id: 'x' }, { id: 'ok', entries: [{ exId: 'a', sets: [] }] }] },
        },
      })
    )
    expect(r.status).toBe(200)
    const g = await call(ENV, req(BASE + '/api/data', { token: TOKEN }))
    const st = (await g.json()).state
    expect(st.workouts).toHaveLength(1)
    expect(st.workouts[0].id).toBe('ok')
  })
})

describe('Web Push 加密（RFC 8291 往返）', () => {
  it('输出匹配 RFC 8291 §5 的完整公开测试向量', async () => {
    const decode = s => new Uint8Array(Buffer.from(s, 'base64url'))
    const sender = decode(
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
    )
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: b64u(sender.slice(1, 33)),
        y: b64u(sender.slice(33)),
        d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
      },
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    )
    const publicKey = await crypto.subtle.importKey(
      'raw',
      sender,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    )
    const generate = vi.spyOn(crypto.subtle, 'generateKey').mockResolvedValueOnce({ privateKey, publicKey })
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementationOnce(array => {
      array.set(decode('DGv6ra1nlYgDCS1FRnbzlw'))
      return array
    })
    try {
      const body = await api.encryptPush(
        'When I grow up, I want to be a watermelon',
        'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        'BTBZMqHH6r4Tts7J_aSIgg'
      )
      expect(b64u(body)).toBe(
        'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
      )
    } finally {
      generate.mockRestore()
      random.mockRestore()
    }
  })
  let clientPriv, clientPubRaw, auth
  beforeAll(async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    clientPriv = kp.privateKey
    clientPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
    auth = crypto.getRandomValues(new Uint8Array(16))
  })

  async function decryptPush(body, clientPriv) {
    const salt = body.slice(0, 16)
    const idlen = body[20]
    const ephPubRaw = body.slice(21, 21 + idlen)
    const cipher = body.slice(21 + idlen)
    const ephPub = await crypto.subtle.importKey(
      'raw',
      ephPubRaw,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    )
    const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: ephPub }, clientPriv, 256)
    // 按 RFC 8291 §3.4 拼接，不使用实现中的长度常量。
    const info = Buffer.concat([
      Buffer.from('WebPush: info\0'),
      Buffer.from(clientPubRaw),
      Buffer.from(ephPubRaw),
    ])
    const hkdf = async (slt, ikm2, inf, len) => {
      const key = await crypto.subtle.importKey('raw', ikm2, 'HKDF', false, ['deriveBits'])
      return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: slt, info: inf }, key, len * 8)
    }
    const ikm = await hkdf(auth, shared, info, 32)
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher))
    let end = pt.length - 1
    while (pt[end] === 0) end--
    expect(pt[end]).toBe(2)
    return dec.decode(pt.slice(0, end))
  }
  const dec = new TextDecoder()

  it('加密载荷可被客户端密钥完整解密', async () => {
    const payload = JSON.stringify({ title: '测试', body: 'roundtrip' })
    const body = await api.encryptPush(payload, b64u(clientPubRaw), b64u(auth))
    expect(body.length).toBeGreaterThan(80)
    const out = await decryptPush(body, clientPriv)
    expect(out).toBe(payload)
  })
  it('换一对密钥解不开（防串扰）', async () => {
    const body = await api.encryptPush('secret', b64u(clientPubRaw), b64u(auth))
    const other = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    await expect(decryptPush(body, other.privateKey)).rejects.toThrow()
  })
})

describe('持久化休息任务', () => {
  it('90 秒任务使用 Alarm，实例重建后仍可取消或发送', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    try {
      const env = makeEnv()
      const { token, uid } = await (
        await call(env, req(BASE + '/api/register', { method: 'POST', body: {}, ip: '198.51.100.22' }))
      ).json()
      const schedule = () =>
        call(env, req(BASE + '/api/push/rest', { method: 'POST', token, body: { sec: 90, label: '卧推' } }))
      const { id } = await (await schedule()).json()
      const user = env._users.get(uid)
      expect(await user.ctx.storage.getAlarm()).toBe(Date.now() + 90000)
      user.instance = new api.GymUser(user.ctx, env)
      expect((await user.ctx.storage.list({ prefix: 'rest:' })).size).toBe(1)
      await call(env, req(BASE + '/api/push/rest/cancel', { method: 'POST', token, body: { id } }))
      expect((await user.ctx.storage.list({ prefix: 'rest:' })).size).toBe(0)
      await schedule()
      vi.setSystemTime(Date.now() + 90001)
      await user.instance.alarm()
      expect((await user.ctx.storage.list({ prefix: 'rest:' })).size).toBe(0)
      expect(await user.ctx.storage.getAlarm()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
  it('订阅服务失败不会被计入成功发送', async () => {
    const env = makeEnv()
    const { token } = await (
      await call(env, req(BASE + '/api/register', { method: 'POST', body: {}, ip: '198.51.100.23' }))
    ).json()
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    await call(
      env,
      req(BASE + '/api/push/subscribe', {
        method: 'POST',
        token,
        body: {
          endpoint: 'https://fcm.googleapis.com/test',
          keys: {
            p256dh: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)),
            auth: b64u(crypto.getRandomValues(new Uint8Array(16))),
          },
        },
      })
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
    try {
      const result = await (await call(env, req(BASE + '/api/push/test', { method: 'POST', token }))).json()
      expect(result).toEqual({ sent: 0, total: 1 })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('诊断上报（错误 + SW 状态）', () => {
  it('未认证一律 401', async () => {
    expect((await call(ENV, req(BASE + '/api/error', { method: 'POST', body: { msg: 'x' } }))).status).toBe(
      401
    )
    expect((await call(ENV, req(BASE + '/api/sw-report', { method: 'POST', body: {} }))).status).toBe(401)
    expect((await call(ENV, req(BASE + '/api/diagnostics'))).status).toBe(401)
  })
  it('错误上报入库、超长截断、诊断可读回', async () => {
    const long = 'x'.repeat(9999)
    const r = await call(
      ENV,
      req(BASE + '/api/error', {
        method: 'POST',
        token: TOKEN,
        body: { v: '1.1.0', msg: 'boom: ' + long, stack: long, url: 'https://x/gym-gym/', ua: 'iOS' },
      })
    )
    expect(r.status).toBe(200)
    const d = await call(ENV, req(BASE + '/api/diagnostics', { token: TOKEN }))
    const { errors } = await d.json()
    expect(errors).toHaveLength(1)
    expect(errors[0].msg.startsWith('boom: ')).toBe(true)
    expect(errors[0].msg.length).toBeLessThanOrEqual(500)
    expect(errors[0].stack.length).toBeLessThanOrEqual(1500)
  })
  it('SW 状态自报：同设备只留最新一条', async () => {
    const post = v =>
      call(
        ENV,
        req(BASE + '/api/sw-report', {
          method: 'POST',
          token: TOKEN,
          body: { v, dev: 'phoneA', swActive: true, cacheNames: ['gym-gym-v2'], precache: 'ok', ua: 'iOS' },
        })
      )
    expect((await post('1.1.0')).status).toBe(200)
    expect((await post('1.1.1')).status).toBe(200)
    const d = await call(ENV, req(BASE + '/api/diagnostics', { token: TOKEN }))
    const { devices } = await d.json()
    expect(devices).toHaveLength(1)
    expect(devices[0].v).toBe('1.1.1')
    expect(devices[0].cacheNames).toEqual(['gym-gym-v2'])
  })
})

describe('速率限制', () => {
  it('注册超过 5 次/分钟后 429（按独立 IP 隔离）', async () => {
    const ip = '203.0.113.' + Math.floor(Math.random() * 200) // 独立 IP，避免污染其他用例的桶
    let last
    for (let i = 0; i < 6; i++) {
      last = await call(ENV, req(BASE + '/api/register', { method: 'POST', body: { name: 'rl' }, ip }))
    }
    expect(last.status).toBe(429)
    const d = await last.json()
    expect(d.retryAfter).toBeGreaterThan(0)
    // 其他 IP 不受影响
    const ok = await call(
      ENV,
      req(BASE + '/api/register', { method: 'POST', body: { name: 'rl2' }, ip: '198.51.100.7' })
    )
    expect(ok.status).toBe(200)
  })
  it('诊断组限流生效', async () => {
    const ip = '192.0.2.' + Math.floor(Math.random() * 200)
    let last
    for (let i = 0; i < 21; i++) {
      last = await call(ENV, req(BASE + '/api/diagnostics', { token: TOKEN, ip }))
    }
    expect(last.status).toBe(429)
  })
})
