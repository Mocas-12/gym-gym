# 云同步与推送（可选功能）

GymGym 本体是纯本地的，这个功能是**可选**的：连上你自己部署的微后端后，获得

1. **多设备同步**：训练数据（模板/计划/记录/体重）在手机、电脑之间自动同步
2. **Web Push 推送**：休息计时结束时推送提醒——iPhone 收到后**自动镜像到 Apple Watch**，训练时手机不在手边手表就是计时器
3. **诊断自报**（v1.1.0+）：连接同步后，客户端崩溃与 Service Worker/缓存状态自动上报到你自己的后端，设置页可查看——排查「线上到底跑的是什么版本」不再靠猜

## 架构

```
iPhone/电脑 (PWA) ──HTTPS──> Cloudflare Worker（你部署，免费额度）
   localStorage  <──409冲突自动合并──  Workers KV 存储
        ▲
   手表（iOS 自动镜像 iPhone 通知 / 快捷指令调 API）
```

- 数据模型：每用户一份 JSON 文档 + 修订号（`_rev`），push 带 `baseRev` 条件写，冲突返回 409 + 服务器文档，客户端按「最后改动时间」新者胜（文档级 LWW）
- 推送：标准 Web Push（VAPID + RFC 8291 加密），Worker 内实现，无第三方依赖
- 隐私：数据只有你自己（Bearer 令牌）和你的 CF 账号能看到；不想要了删掉 Worker 即归零。诊断上报同样进你自己的 KV，内容只有错误消息/栈、app 版本、UA、SW 状态——**不含任何训练数据**

## 部署步骤（约 10 分钟）

1. 注册 [Cloudflare](https://dash.cloudflare.com/sign-up) 账号（免费）
2. 本机安装 wrangler 并登录（浏览器授权一次）：

```bash
npx wrangler login
```

3. 创建 KV 存储：

```bash
cd backend
npx wrangler kv namespace create KV
# 输出里有 id = "xxxx"，填入 wrangler.toml 的 [[kv_namespaces]] id
```

4. 把 `wrangler.toml` 里 `VAPID_SUB` 的邮箱改成你自己的（推送服务商要求留联系方式）
5. 创建后端代码文件 `backend/worker.js`：内容见本文档最下方「Worker 完整代码」，原样保存
6. 部署（仓库里直接跑，脚本自动从本文档提取代码到临时目录）：

```bash
npm run backend:deploy
# 输出的 https://gymgym-backend.你的子域.workers.dev 就是你的服务器地址
```

7. 验证：浏览器打开 `https://你的地址/api/health`，应显示 `{"ok":true,...}`

## App 里连接

设置 → **同步与推送（可选）**：

- 填服务器地址 + 昵称 → **连接**（自动注册，得到一个令牌）
- 其他设备：填**同一个服务器地址 + 同一个令牌** → 连接 → 数据自动合并
- **开启推送**（会请求通知权限，需先添加到主屏幕）→ **测试** 按钮验证

连接后自动同步时机：app 启动、每次改动后 60 秒内、回到前台。连接状态下还会自动上报诊断（见上）。

## Apple Watch（第二层：快捷指令）

推送开启后，休息结束提醒会自动出现在手表上（iPhone 锁屏通知的镜像）。再进一步，在手表的「快捷指令」App 里建两个指令（数据真同步，不用掏手机）：

- **记体重**：获取输入 → 「获取 URL 内容」（POST `你的服务器/api/push/test` 不适合这里——用下面的同步指令）——体重快捷指令需要第三层 API 扩展，暂未开放写入口
- **同步检查**：GET `你的服务器/api/health` → 显示返回，确认手表到服务器的链路通

> 说明：快捷指令直写训练数据的 API（第二层完整版）在路线图里，当前快捷指令主要用于验证链路与收推送。

## 限制与说明

- **文档级 LWW**：两台设备**同时**离线各自改动再同步时，整个文档按「最后改动」覆盖（不做字段级合并）。单人使用冲突概率很低；重要数据勤用「导出备份」
- **速率限制**（v1.1.0+）：Worker 对每 IP 按路由组分窗口限流（注册 5/分、读 60/分、写 30/分、推送 30/分、诊断 20/分），超限返回 429——目的是防止失控循环打爆 KV 免费写额度（1000 写/天），正常使用无感
- **休息推送**：Worker 收到请求后定时发送；免费额度足够个人使用。页面在后台时可能被 iOS 冻结，这正是推送兜底的场景
- **iOS 推送前提**：PWA 已添加到主屏幕（iOS 16.4+ 的要求）
- 令牌即密码：不要分享。泄露后在 CF 后台删掉 KV 里的 `auth:` 记录即可作废

## Worker 完整代码（保存为 `backend/worker.js`）

```js
/* GymGym 微后端 —— Cloudflare Worker（免费额度可跑）。
 * 职责：① 单 JSON 文档同步（修订号条件写，冲突返回 409+服务器文档）
 *       ② Web Push：VAPID 签名 + RFC 8291 aes128gcm 载荷加密 + 休息计时定时推送
 *       ③ 诊断：客户端错误上报 + SW/缓存状态自报（连接了同步才会上报）
 * 认证：/api/register 换 uid.secret 令牌（Bearer），除 register/health 外全部要令牌。
 * 注意：本文档的代码块是部署与测试的唯一提取源（deploy-backend.mjs / worker.test.js）。
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
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('')
const sleep = ms => new Promise(r => setTimeout(r, ms))
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
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
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
  const payload = b64uJson({ aud, exp: Math.floor(Date.now() / 1000) + 43200, sub: env.VAPID_SUB || 'mailto:gymgym@example.com' })
  const key = await crypto.subtle.importKey('jwk', keys.privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${payload}`))
  return `vapid t=${header}.${payload}.${u8ToB64u(sig)},k=${keys.pubRaw}`
}

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8)
}

async function encryptPush(payloadStr, p256dhB64u, authB64u) {
  const clientPub = await crypto.subtle.importKey('raw', b64uToU8(p256dhB64u), { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  const auth = b64uToU8(authB64u)
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPub }, eph.privateKey, 256)
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  const clientPubRaw = b64uToU8(p256dhB64u)

  const info = new Uint8Array(19 + 65 + 65)
  info.set(enc.encode('WebPush: info\0'), 0)
  info.set(clientPubRaw, 19)
  info.set(ephPubRaw, 19 + 65)
  const ikm = await hkdf(auth, shared, info, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const plaintext = enc.encode(payloadStr)
  const block = new Uint8Array(17 + plaintext.length + 2)
  block.set(enc.encode('WebPush: padding\0'), 0)
  block.set(plaintext, 17)
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
const PUSH_SERVICE_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'])

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
  const res = await fetch(sub.endpoint, { method: 'POST', headers, body })
  return res.ok || (res.status !== 404 && res.status !== 410)
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
  for (const sub of subs) {
    const ok = await sendToSubscription({ ...sub, urgency: urgency || sub.urgency }, payload, keys, env)
    if (ok) alive.push(sub)
  }
  if (alive.length !== subs.length) await saveSubs(env, uid, alive)
  return { sent: alive.length, total: subs.length }
}

const pendingRest = new Set()

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
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin') || ''
    const url = new URL(request.url)
    const route = request.method + ' ' + url.pathname
    const answer = (code, body) => withCors(j(new Response(), code, body), origin, env)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) })

    // 限流组：先于一切 KV 操作
    const rlGroup =
      route === 'POST /api/register' ? 'register'
      : route === 'GET /api/data' ? 'read'
      : route.startsWith('POST /api/push') || route === 'DELETE /api/data' ? 'push'
      : route === 'POST /api/error' || route === 'POST /api/sw-report' || route === 'GET /api/diagnostics' ? 'diag'
      : route === 'PUT /api/data' ? 'write'
      : null
    if (rlGroup) {
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
        await env.KV.put('meta:' + uid, JSON.stringify({ name: String(name || '').slice(0, 30), created: Date.now() }))
        return answer(200, { uid, token: `${uid}.${secret}` })
      }

      const uid = await authUid(request, env)
      if (!uid) return answer(401, { error: 'unauthorized' })

      if (route === 'GET /api/data') {
        const raw = await env.KV.get('state:' + uid)
        if (!raw) return answer(200, { rev: 0, state: null })
        const doc = JSON.parse(raw)
        return answer(200, { rev: doc._rev || 0, wid: doc._wid, state: doc })
      }

      if (route === 'PUT /api/data') {
        const body = await request.json()
        const state = body.state
        if (!state || typeof state !== 'object' || Array.isArray(state)) return answer(400, { error: 'state required' })
        // 服务器侧净化（防线的最后一道）：历史页崩溃类脏数据不允许入库
        state.workouts = (Array.isArray(state.workouts) ? state.workouts : []).filter(w => w && typeof w === 'object' && Array.isArray(w.entries))
        state.bodyweight = (Array.isArray(state.bodyweight) ? state.bodyweight : []).filter(e => e && typeof e === 'object')
        const raw = await env.KV.get('state:' + uid)
        const cur = raw ? JSON.parse(raw) : null
        const rev = cur?._rev || 0
        if (body.baseRev != null && body.baseRev !== rev) return answer(409, { error: 'conflict', rev, state: cur })
        state._rev = rev + 1
        state._wid = hex(8)
        state._ts = Date.now()
        await env.KV.put('state:' + uid, JSON.stringify(state))
        return answer(200, { rev: state._rev, wid: state._wid, ts: state._ts })
      }

      if (route === 'DELETE /api/data') {
        await env.KV.delete('state:' + uid)
        return answer(200, { ok: true })
      }

      if (route === 'GET /api/push/public-key') {
        const keys = await vapidKeys(env)
        return answer(200, { key: keys.pubRaw })
      }

      if (route === 'POST /api/push/subscribe') {
        const sub = await request.json()
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return answer(400, { error: 'bad subscription' })
        const host = pushHostOf(sub.endpoint)
        if (!host || !PUSH_SERVICE_HOSTS.has(host)) return answer(400, { error: 'untrusted push endpoint' })
        const subs = await userSubs(env, uid)
        if (!subs.some(s => s.endpoint === sub.endpoint)) subs.push(sub)
        await saveSubs(env, uid, subs)
        return answer(200, { ok: true, count: subs.length })
      }

      if (route === 'POST /api/push/unsubscribe') {
        const { endpoint } = await request.json()
        await saveSubs(env, uid, (await userSubs(env, uid)).filter(s => s.endpoint !== endpoint))
        return answer(200, { ok: true })
      }

      if (route === 'POST /api/push/test') return answer(200, await pushAll(env, uid, JSON.stringify({ title: 'GymGym', body: '推送通道正常 💪' }), 'normal'))

      if (route === 'POST /api/push/rest') {
        const { sec, label } = await request.json()
        const id = hex(6)
        pendingRest.add(id)
        const payload = JSON.stringify({ title: 'GymGym · 休息结束', body: label || '下一组', restId: id, tag: 'rest' })
        ctx.waitUntil(
          (async () => {
            await sleep(Math.max(1, Math.min(900, Number(sec) || 0)) * 1000)
            if (!pendingRest.has(id)) return
            pendingRest.delete(id)
            await pushAll(env, uid, payload, 'high')
          })()
        )
        return answer(200, { id })
      }

      if (route === 'POST /api/push/rest/cancel') {
        const { id } = await request.json()
        pendingRest.delete(id)
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
```
