import { normalizeState } from '../src/lib/normalize.js'

/* GymGym 微后端 —— Cloudflare Worker（免费额度可跑）。
 * 职责：① 单 JSON 文档同步（修订号条件写，冲突返回 409+服务器文档）
 *       ② Web Push：VAPID 签名 + RFC 8291 aes128gcm 载荷加密 + 休息计时定时推送
 *       ③ 诊断：客户端错误上报 + SW/缓存状态自报（连接了同步才会上报）
 * 认证：/api/register 换 uid.secret 令牌（Bearer），除 register/health 外全部要令牌。
 * 同步状态与休息任务由每用户一个 Durable Object 持久化。
 */

const JSON_H = { 'content-type': 'application/json; charset=utf-8' }
const DEFAULT_ORIGINS = 'https://mocas-12.github.io,http://localhost:5173,http://localhost:4173'

const enc = new TextEncoder()

/* base64url 编解码：手写码表实现（不依赖 atob/btoa） */
const B64U_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const u8ToB64u = input => {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input) // exportKey/sign 返回 ArrayBuffer，统一收口
  const out = []
  for (let i = 0; i < u8.length; i += 3) {
    const b0 = u8[i]
    const b1 = u8[i + 1]
    const b2 = u8[i + 2]
    out.push(B64U_CHARS[b0 >> 2])
    out.push(B64U_CHARS[((b0 & 3) << 4) | ((b1 || 0) >> 4)])
    if (b1 === undefined) out.push('', '')
    else {
      out.push(B64U_CHARS[((b1 & 15) << 2) | ((b2 || 0) >> 6)])
      out.push(b2 === undefined ? '' : B64U_CHARS[b2 & 63])
    }
  }
  return out.join('')
}
const b64uToU8 = s => {
  const clean = []
  for (const ch of s) {
    const v = B64U_CHARS.indexOf(ch)
    if (v >= 0) clean.push(v)
  }
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  // 注意：末尾 quad 可能不足 4 个字符，靠 undefined-break 收尾（此前边界条件写错，曾丢失 auth 尾字节）
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = clean[i]
    const c1 = clean[i + 1]
    const c2 = clean[i + 2]
    const c3 = clean[i + 3]
    if (c1 === undefined) break
    out[o++] = (c0 << 2) | (c1 >> 4)
    if (c2 === undefined) break
    out[o++] = ((c1 & 15) << 4) | (c2 >> 2)
    if (c3 === undefined) break
    out[o++] = ((c2 & 3) << 6) | c3
  }
  return out.slice(0, o)
}
const hex = n =>
  [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('')
const j = (res, code, body) => new Response(JSON.stringify(body), { status: code, headers: JSON_H })

/* ---- 速率限制：进程内存固定窗口（每 isolate 独立，跨 PoP 不共享）。
 * 目的不是精确限流，是挡住失控循环/脚本滥用对 KV 写额度（免费档 1000 写/天）的冲击。
 * 全部在触达任何 KV 操作之前检查。 ---- */
const RL_GROUPS = {
  register: { limit: 5, windowMs: 60000 },
  read: { limit: 60, windowMs: 60000 },
  write: { limit: 30, windowMs: 60000 },
  push: { limit: 30, windowMs: 60000 },
  diag: { limit: 20, windowMs: 60000 },
}
const rlBuckets = new Map()

function rateLimit(request, group) {
  const cfg = RL_GROUPS[group]
  if (!cfg) return null
  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  const now = Date.now()
  const key = group + ':' + ip
  let b = rlBuckets.get(key)
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + cfg.windowMs }
    rlBuckets.set(key, b)
    if (rlBuckets.size > 2000) for (const [k, v] of rlBuckets) if (now > v.reset) rlBuckets.delete(k)
  }
  b.count++
  return b.count > cfg.limit ? Math.ceil((b.reset - now) / 1000) : null
}

function cors(origin, env) {
  const allowed = (env.ORIGINS || DEFAULT_ORIGINS).split(',').map(s => s.trim())
  const ok = allowed.includes(origin)
  return {
    'access-control-allow-origin': ok ? origin : allowed[0],
    'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '86400',
  }
}
const withCors = (res, origin, env) => {
  const c = cors(origin, env)
  for (const k in c) res.headers.set(k, c[k])
  return res
}

async function authUid(request, env) {
  const m = /^Bearer (\w+)\.(\w+)$/.exec(request.headers.get('authorization') || '')
  if (!m) return null
  const uid = m[1]
  const secret = m[2]
  const stored = await env.KV.get('auth:' + uid)
  if (!stored || stored.length !== secret.length) return null
  let diff = 0
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ stored.charCodeAt(i)
  return diff === 0 ? uid : null
}

async function vapidKeys(env) {
  const saved = await env.KV.get('vapid')
  if (saved) {
    const k = JSON.parse(saved)
    if (k.pubRaw) return k // 自愈：旧的坏缓存（空 pubRaw）不信任，重新生成
  }
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const keys = {
    privJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    pubRaw: u8ToB64u(await crypto.subtle.exportKey('raw', pair.publicKey)),
  }
  await env.KV.put('vapid', JSON.stringify(keys))
  return keys
}

const b64uJson = o => u8ToB64u(enc.encode(JSON.stringify(o)))

async function vapidAuthorization(endpoint, keys, env) {
  const aud = new URL(endpoint).origin
  const header = b64uJson({ typ: 'JWT', alg: 'ES256' })
  const payload = b64uJson({
    aud,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: env.VAPID_SUB || 'mailto:gymgym@example.com',
  })
  const key = await crypto.subtle.importKey(
    'jwk',
    keys.privJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(`${header}.${payload}`)
  )
  return `vapid t=${header}.${payload}.${u8ToB64u(sig)},k=${keys.pubRaw}`
}

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8)
}

async function encryptPush(payloadStr, p256dhB64u, authB64u) {
  const clientPub = await crypto.subtle.importKey(
    'raw',
    b64uToU8(p256dhB64u),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  )
  const auth = b64uToU8(authB64u)
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPub }, eph.privateKey, 256)
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  const clientPubRaw = b64uToU8(p256dhB64u)

  const prefix = enc.encode('WebPush: info\0')
  const info = new Uint8Array(prefix.length + clientPubRaw.length + ephPubRaw.length)
  info.set(prefix)
  info.set(clientPubRaw, prefix.length)
  info.set(ephPubRaw, prefix.length + clientPubRaw.length)
  const ikm = await hkdf(auth, shared, info, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const plaintext = enc.encode(payloadStr)
  const block = new Uint8Array(plaintext.length + 1)
  block.set(plaintext)
  block[plaintext.length] = 2
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, block))

  const body = new Uint8Array(16 + 4 + 1 + 65 + cipher.length)
  body.set(salt, 0)
  new DataView(body.buffer).setUint32(16, 4096)
  body[20] = 65
  body.set(ephPubRaw, 21)
  body.set(cipher, 21 + 65)
  return body
}

/* 推送端点防护：仅允许三大浏览器厂商推送服务（精确匹配），杜绝内网探测 */
const PUSH_SERVICE_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
])

function pushHostOf(raw) {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return null
    return u.hostname.toLowerCase()
  } catch {
    return null
  }
}

async function sendToSubscription(sub, payload, keys, env) {
  // fetch 前必须白名单精确命中厂商推送域（上面 set），除此之外一律拒绝发请求
  const host = pushHostOf(sub.endpoint)
  if (!host || !PUSH_SERVICE_HOSTS.has(host)) return false
  const body = await encryptPush(payload, sub.keys.p256dh, sub.keys.auth)
  const headers = {
    Authorization: await vapidAuthorization(sub.endpoint, keys, env),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: '3600',
    Urgency: sub.urgency || 'normal',
  }
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers,
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  })
  return { delivered: res.ok, expired: res.status === 404 || res.status === 410 }
}

async function userSubs(env, uid) {
  const raw = await env.KV.get('subs:' + uid)
  return raw ? JSON.parse(raw) : []
}
async function saveSubs(env, uid, subs) {
  if (subs.length) await env.KV.put('subs:' + uid, JSON.stringify(subs))
  else await env.KV.delete('subs:' + uid)
}

async function pushAll(env, uid, payload, urgency) {
  const keys = await vapidKeys(env)
  const subs = await userSubs(env, uid)
  const alive = []
  let sent = 0
  await Promise.all(
    subs.map(async sub => {
      try {
        const result = await sendToSubscription(
          { ...sub, urgency: urgency || sub.urgency },
          payload,
          keys,
          env
        )
        if (result && result.delivered) sent++
        if (!result || !result.expired) alive.push(sub)
      } catch {
        alive.push(sub)
      }
    })
  )
  if (alive.length !== subs.length) await saveSubs(env, uid, alive)
  return { sent, total: subs.length }
}

/* 每用户串行处理状态检查与写入；任务和 Alarm 均保存在对象存储中。 */
export class GymUser {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
  }

  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const uid = await authUid(request, this.env)
      if (!uid) return j(null, 401, { error: 'unauthorized' })
      if (!(await this.ctx.storage.get('migrated'))) {
        const raw = await this.env.KV.get('state:' + uid)
        if (raw) await this.ctx.storage.put('state', raw)
        await this.ctx.storage.put('migrated', true)
      }
      return handler.fetch(request, { ...this.env, USER_STORAGE: this.ctx.storage }, this.ctx)
    })
  }

  async alarm() {
    return this.ctx.blockConcurrencyWhile(async () => {
      const jobs = await this.ctx.storage.list({ prefix: 'rest:' })
      let next = Infinity
      for (const [key, job] of jobs) {
        if (job.due > Date.now()) {
          next = Math.min(next, job.due)
          continue
        }
        if (Date.now() - job.created < 3600000) {
          const result = await pushAll(this.env, job.uid, job.payload, 'high')
          if (result.sent < result.total && job.attempts < 2) {
            job.attempts++
            job.due = Date.now() + 30000
            await this.ctx.storage.put(key, job)
            next = Math.min(next, job.due)
            continue
          }
        }
        await this.ctx.storage.delete(key)
      }
      if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next)
      else await this.ctx.storage.deleteAlarm()
    })
  }
}

/* ---- 诊断存储：环形缓冲，单 key 单用户，写入时刷新 TTL（30 天滑动） ---- */
const ERR_CAP = 20
const SW_CAP = 10
const DIAG_TTL = 60 * 60 * 24 * 30

/* 字符串收口：非字符串丢弃、超长截断（错误报告是唯一的外来文本，防垃圾撑爆 KV 值） */
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined)

async function addErrorReport(env, uid, body) {
  const item = {
    t: Date.now(),
    v: clip(body.v, 40) || '?',
    msg: clip(body.msg, 500) || 'unknown',
    stack: clip(body.stack, 1500),
    url: clip(body.url, 200),
    ua: clip(body.ua, 200),
  }
  const raw = await env.KV.get('err:' + uid)
  const list = raw ? JSON.parse(raw) : []
  list.unshift(item)
  await env.KV.put('err:' + uid, JSON.stringify(list.slice(0, ERR_CAP)), { expirationTtl: DIAG_TTL })
}

async function addSwReport(env, uid, body) {
  const item = {
    t: Date.now(),
    v: clip(body.v, 40) || '?',
    dev: clip(body.dev, 32) || '?',
    swActive: !!body.swActive,
    swV: clip(body.swV, 20),
    cacheNames: Array.isArray(body.cacheNames) ? body.cacheNames.slice(0, 10).map(c => clip(c, 40)) : [],
    precache: clip(body.precache, 20) || 'unknown',
    ua: clip(body.ua, 200),
  }
  const raw = await env.KV.get('sw:' + uid)
  const list = raw ? JSON.parse(raw) : []
  const i = list.findIndex(x => x.dev === item.dev)
  if (i >= 0) list.splice(i, 1) // 同设备只留最新一条
  list.unshift(item)
  await env.KV.put('sw:' + uid, JSON.stringify(list.slice(0, SW_CAP)), { expirationTtl: DIAG_TTL })
}

const handler = {
  async fetch(request, env, _ctx) {
    const origin = request.headers.get('origin') || ''
    const url = new URL(request.url)
    const route = request.method + ' ' + url.pathname
    const answer = (code, body) => withCors(j(new Response(), code, body), origin, env)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) })

    // 限流组：先于一切 KV 操作
    const rlGroup =
      route === 'POST /api/register'
        ? 'register'
        : route === 'GET /api/data'
          ? 'read'
          : route.startsWith('POST /api/push') || route === 'DELETE /api/data'
            ? 'push'
            : route === 'POST /api/error' ||
                route === 'POST /api/sw-report' ||
                route === 'GET /api/diagnostics'
              ? 'diag'
              : route === 'PUT /api/data'
                ? 'write'
                : null
    if (rlGroup && !env.USER_STORAGE) {
      const retry = rateLimit(request, rlGroup)
      if (retry) return answer(429, { error: 'rate limited', retryAfter: retry })
    }

    try {
      if (route === 'GET /api/health') return answer(200, { ok: true, time: Date.now(), v: 2 })

      if (route === 'POST /api/register') {
        const { name } = await request.json()
        const uid = hex(6)
        const secret = hex(24)
        await env.KV.put('auth:' + uid, secret)
        await env.KV.put(
          'meta:' + uid,
          JSON.stringify({ name: String(name || '').slice(0, 30), created: Date.now() })
        )
        return answer(200, { uid, token: `${uid}.${secret}` })
      }

      const uid = await authUid(request, env)
      if (!uid) return answer(401, { error: 'unauthorized' })
      if (!env.USER_STORAGE) {
        if (!env.USERS) return answer(503, { error: 'Durable Object binding USERS required' })
        const res = await env.USERS.get(env.USERS.idFromName(uid)).fetch(request)
        return withCors(new Response(res.body, res), origin, env)
      }
      const storage = env.USER_STORAGE

      if (route === 'GET /api/data') {
        const raw = await storage.get('state')
        if (!raw) return answer(200, { rev: 0, state: null })
        const doc = JSON.parse(raw)
        return answer(200, { rev: doc._rev || 0, wid: doc._wid, state: doc })
      }

      if (route === 'PUT /api/data') {
        const body = await request.json()
        const state = body.state
        if (!state || typeof state !== 'object' || Array.isArray(state))
          return answer(400, { error: 'state required' })
        // 服务器侧净化（防线的最后一道）：历史页崩溃类脏数据不允许入库
        normalizeState(state)
        const raw = await storage.get('state')
        const cur = raw ? JSON.parse(raw) : null
        const rev = cur?._rev || 0
        if (!Number.isInteger(body.baseRev) || body.baseRev < 0)
          return answer(400, { error: 'baseRev required' })
        if (body.baseRev !== rev) return answer(409, { error: 'conflict', rev, state: cur })
        state._rev = rev + 1
        state._wid = hex(8)
        state._ts = Date.now()
        await storage.put('state', JSON.stringify(state))
        return answer(200, { rev: state._rev, wid: state._wid, ts: state._ts })
      }

      if (route === 'DELETE /api/data') {
        // 删除也保留修订号，旧设备不能用 rev:0 复活旧文档。
        const raw = await storage.get('state')
        const rev = raw ? JSON.parse(raw)._rev || 0 : 0
        await storage.put(
          'state',
          JSON.stringify({ _rev: rev + 1, _deleted: true, workouts: [], bodyweight: [] })
        )
        return answer(200, { ok: true, rev: rev + 1 })
      }

      if (route === 'GET /api/push/public-key') {
        const keys = await vapidKeys(env)
        return answer(200, { key: keys.pubRaw })
      }

      if (route === 'POST /api/push/subscribe') {
        const sub = await request.json()
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth)
          return answer(400, { error: 'bad subscription' })
        const host = pushHostOf(sub.endpoint)
        if (!host || !PUSH_SERVICE_HOSTS.has(host)) return answer(400, { error: 'untrusted push endpoint' })
        const subs = await userSubs(env, uid)
        if (subs.length >= 10 && !subs.some(s => s.endpoint === sub.endpoint))
          return answer(429, { error: 'too many devices' })
        if (!subs.some(s => s.endpoint === sub.endpoint)) subs.push(sub)
        await saveSubs(env, uid, subs)
        return answer(200, { ok: true, count: subs.length })
      }

      if (route === 'POST /api/push/unsubscribe') {
        const { endpoint } = await request.json()
        await saveSubs(
          env,
          uid,
          (await userSubs(env, uid)).filter(s => s.endpoint !== endpoint)
        )
        return answer(200, { ok: true })
      }

      if (route === 'POST /api/push/test')
        return answer(
          200,
          await pushAll(env, uid, JSON.stringify({ title: 'GymGym', body: '推送通道正常 💪' }), 'normal')
        )

      if (route === 'POST /api/push/rest') {
        const { sec, label } = await request.json()
        const id = hex(6)
        if (!Number.isFinite(sec) || sec < 1 || sec > 900) return answer(400, { error: 'sec must be 1..900' })
        const jobs = await storage.list({ prefix: 'rest:' })
        if (jobs.size >= 100) return answer(429, { error: 'too many pending reminders' })
        const due = Date.now() + sec * 1000
        const payload = JSON.stringify({
          title: 'GymGym · 休息结束',
          body: clip(label, 200) || '下一组',
          restId: id,
          tag: 'rest',
        })
        await storage.put('rest:' + id, { uid, due, created: Date.now(), payload, attempts: 0 })
        const alarm = await storage.getAlarm()
        if (alarm == null || alarm > due) await storage.setAlarm(due)
        return answer(200, { id })
      }

      if (route === 'POST /api/push/rest/cancel') {
        const { id } = await request.json()
        await storage.delete('rest:' + id)
        return answer(200, { ok: true })
      }

      /* ---- 诊断（连接了同步的客户端才会上报；数据只有令牌持有者能写入/读取） ---- */

      if (route === 'POST /api/error') {
        const body = await request.json()
        await addErrorReport(env, uid, body || {})
        return answer(200, { ok: true })
      }

      if (route === 'POST /api/sw-report') {
        const body = await request.json()
        await addSwReport(env, uid, body || {})
        return answer(200, { ok: true })
      }

      if (route === 'GET /api/diagnostics') {
        const [errRaw, swRaw] = await Promise.all([env.KV.get('err:' + uid), env.KV.get('sw:' + uid)])
        return answer(200, {
          errors: errRaw ? JSON.parse(errRaw) : [],
          devices: swRaw ? JSON.parse(swRaw) : [],
        })
      }

      return answer(404, { error: 'not found' })
    } catch (err) {
      return answer(500, { error: String((err && err.message) || err) })
    }
  },
}

export default handler
export { encryptPush, sendToSubscription, rateLimit }
