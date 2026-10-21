/* 极简 Service Worker：导航请求网络优先（发新版即拿到最新），静态资源缓存优先。
 * 目的有二：让 Android/Chrome 满足可安装条件（触发原生安装框），以及离线打开。 */
/* global PRECACHE_LIST */
const CACHE = 'gym-gym-v3'
const PRECACHED = new Set(
  (typeof PRECACHE_LIST !== 'undefined' ? PRECACHE_LIST : []).map(
    path => new URL(path, self.location.href).href
  )
)

self.addEventListener('install', e =>
  e.waitUntil(
    (async () => {
      console.log('[SW-INSTALL] 开始')
      self.skipWaiting()
      try {
        // 预缓存清单由 scripts/inject-precache.mjs 构建后注入（含外壳与全部 hash 资产）
        const list = typeof PRECACHE_LIST !== 'undefined' ? PRECACHE_LIST : ['./']
        console.log('[SW-INSTALL] list =', JSON.stringify(list))
        const c = await caches.open(CACHE)
        const dbg = {}
        await Promise.all(
          list.map(async u => {
            try {
              const r = await fetch(u)
              dbg[u] = r.status
              if (r.ok) await c.put(u, r)
              else dbg[u] += '/' + r.status
            } catch (e) {
              dbg[u] = 'ERR ' + e.message
            }
          })
        )
        console.log('[SW-INSTALL] 结果', JSON.stringify(dbg))
        await c.put('__install_debug__', new Response(JSON.stringify(dbg)))
      } catch (e) {
        console.log('[SW-INSTALL] 失败', e.message)
        try {
          const c = await caches.open(CACHE)
          await c.put('__install_debug__', new Response(JSON.stringify({ fatal: e.message })))
        } catch {}
      }
    })()
  )
)
self.addEventListener('activate', e =>
  e.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(k => k.startsWith('gym-gym-') && k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
)

/* Web Push：app 在前台可见时静默（页内有声音/震动），否则弹系统通知（手表镜像） */
self.addEventListener('push', e => {
  let d = {}
  try {
    d = e.data.json()
  } catch {
    d = { title: 'GymGym', body: e.data?.text || '' }
  }
  e.waitUntil(
    (async () => {
      if (d.restId) {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        if (clients.some(c => c.visibilityState === 'visible')) return
      }
      await self.registration.showNotification(d.title || 'GymGym', {
        body: d.body || '',
        tag: d.tag || 'gymgym',
        vibrate: [200, 100, 200, 100, 300],
      })
    })()
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const visible = clients.find(c => c.visibilityState === 'visible')
      if (visible) return visible.focus()
      if (clients.length) return clients[0].focus()
      await self.clients.openWindow('./')
    })()
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, copy))
          return res
        })
        .catch(() => caches.match(e.request))
    )
    return
  }
  e.respondWith(
    // 应用静态资源内容固定；预缓存 fetch 与模块、manifest 请求的 Origin 头可能不同。
    caches.match(e.request, { ignoreVary: PRECACHED.has(url.href) }).then(
      hit =>
        hit ||
        fetch(e.request).then(res => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, copy))
          }
          return res
        })
    )
  )
})
