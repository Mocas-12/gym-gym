/* 微后端全链路测试：从 docs/SYNC_PUSH.md 提取 Worker 代码（与部署同源），
 * KV 用内存垫片，在 Node 的 WebCrypto 里完整验证同步与推送加密（RFC 8291 逆向解密）。 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const md = readFileSync(resolve(root, 'docs', 'SYNC_PUSH.md'), 'utf8')
const m = md.match(/```js\n([\s\S]*?)\n```/)
if (!m) throw new Error('docs/SYNC_PUSH.md 缺少代码块')
const enc = new TextEncoder()
const b64u = u8 => Buffer.from(u8).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64uToU8 = s => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = Buffer.from(t, 'base64'); return new Uint8Array(bin) }

let api

beforeAll(async () => {
  const code = m[1]
    .replace(/export async function/g, 'async function')
    .replace('export default {', 'const handler = {')
  const tmp = resolve(root, 'backend', '.worker-under-test.mjs')
  writeFileSync(tmp, code + '\nexport { handler, encryptPush }')
  api = await import(pathToFileURL(tmp).href + '?t=' + Date.now())
  if (typeof api.handler?.fetch !== 'function') throw new Error('模块导出异常：' + Object.keys(api).join(','))
})

const makeEnv = () => {
  const store = new Map()
  return { KV: { get: async k => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, String(v)) }, delete: async k => { store.delete(k) }, _store: store } }
}
const req = (url, { method = 'GET', token = '', body, origin = 'https://mocas-12.github.io' } = {}) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json', origin, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const call = (env, request) => api.handler.fetch(request, env, { waitUntil: p => p.catch(() => {}) })

let TOKEN
const ENV = makeEnv()
const BASE = 'https://x.workers.dev'

describe('同步端点', () => {
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
    const p = await call(ENV, req(BASE + '/api/data', { method: 'PUT', token: TOKEN, body: { baseRev: 0, state: { workouts: [{ id: 1, entries: [{ exId: 'a', sets: [{ done: true }] }] }], settings: { restSec: 75 } } } }))
    expect((await p.json()).rev).toBe(1)
    const g = await call(ENV, req(BASE + '/api/data', { token: TOKEN }))
    expect((await g.json()).state.settings.restSec).toBe(75)
    const c = await call(ENV, req(BASE + '/api/data', { method: 'PUT', token: TOKEN, body: { baseRev: 0, state: { workouts: [] } } }))
    expect(c.status).toBe(409)
    const cd = await c.json()
    expect(cd.rev).toBe(1)
    expect(cd.state.workouts).toHaveLength(1)
  })
  it('PUT 净化：null/无效训练不入库', async () => {
    const r = await call(ENV, req(BASE + '/api/data', { method: 'PUT', token: TOKEN, body: { baseRev: 1, state: { workouts: [null, { id: 'x' }, { id: 'ok', entries: [{ exId: 'a', sets: [] }] }] } } }))
    expect(r.status).toBe(200)
    const g = await call(ENV, req(BASE + '/api/data', { token: TOKEN }))
    const st = (await g.json()).state
    expect(st.workouts).toHaveLength(1)
    expect(st.workouts[0].id).toBe('ok')
  })
})

describe('Web Push 加密（RFC 8291 往返）', () => {
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
    const ephPub = await crypto.subtle.importKey('raw', ephPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
    const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: ephPub }, clientPriv, 256)
    const info = new Uint8Array(19 + 65 + 65)
    info.set(enc.encode('WebPush: info\0'), 0)
    info.set(clientPubRaw, 19)
    info.set(ephPubRaw, 19 + 65)
    const hkdf = async (slt, ikm2, inf, len) => {
      const key = await crypto.subtle.importKey('raw', ikm2, 'HKDF', false, ['deriveBits'])
      return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: slt, info: inf }, key, len * 8)
    }
    const ikm = await hkdf(auth, shared, info, 32)
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher))
    // 去掉 padding 头（到第一个 \0）与尾部 2 字节分隔符
    const zero = pt.indexOf(0)
    return dec.decode(pt.slice(zero + 1, pt.length - 2))
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
