/* 微后端客户端：文档同步 + 推送订阅/触发。
 * 约定见 docs/SYNC_PUSH.md。所有请求 Bearer 令牌认证，无 cookie。 */

const jsonFetch = async (url, { method = 'GET', token = '', body } = {}) => {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: '无法连接服务器（检查地址和网络）' } }
  }
}

export const register = (url, name) => jsonFetch(url.replace(/\/$/, '') + '/api/register', { method: 'POST', body: { name } })
export const pullData = (url, token) => jsonFetch(url.replace(/\/$/, '') + '/api/data', { token })
export const pushData = (url, token, baseRev, state) =>
  jsonFetch(url.replace(/\/$/, '') + '/api/data', { method: 'PUT', token, body: { baseRev, state } })
export const pushPublicKey = (url, token) => jsonFetch(url.replace(/\/$/, '') + '/api/push/public-key', { token })

export const subscribePush = (url, token, subscription) =>
  jsonFetch(url.replace(/\/$/, '') + '/api/push/subscribe', { method: 'POST', token, body: subscription })
export const unsubscribePush = (url, token, endpoint) =>
  jsonFetch(url.replace(/\/$/, '') + '/api/push/unsubscribe', { method: 'POST', token, body: { endpoint } })
export const testPush = (url, token) => jsonFetch(url.replace(/\/$/, '') + '/api/push/test', { method: 'POST', token })

/* 休息计时推送：页面可能随时被冻结，用 keepalive 让请求不随页面挂起丢失 */
export const restPush = (url, token, sec, label) => {
  try {
    return fetch(url.replace(/\/$/, '') + '/api/push/rest', {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ sec, label }),
    }).then(r => r.json()).catch(() => ({}))
  } catch { return Promise.resolve({}) }
}
export const restPushCancel = (url, token, id) => {
  if (!id) return
  try {
    fetch(url.replace(/\/$/, '') + '/api/push/rest/cancel', {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    }).catch(() => {})
  } catch { /* 页面卸载中 */ }
}

/* 推送订阅：请求权限 → 拿 VAPID 公钥 → subscribe。返回 subscription 或抛错。 */
export async function enablePush(serverUrl, token) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('此浏览器不支持推送')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('通知权限未授予')
  const { ok, data } = await pushPublicKey(serverUrl, token)
  if (!ok || !data.key) throw new Error('服务器公钥获取失败（' + (data.error || '令牌可能失效，试试断开后重新连接') + '）')
  const reg = await navigator.serviceWorker.ready
  const keyBytes = Uint8Array.from(atob(data.key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes.buffer,
  })
  const subJson = sub.toJSON()
  const r = await subscribePush(serverUrl, token, subJson)
  if (!r.ok) throw new Error('订阅上传失败：' + (r.data.error || r.status))
  return subJson
}
