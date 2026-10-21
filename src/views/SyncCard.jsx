import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { register, pullData, enablePush, testPush, fetchDiagnostics } from '../lib/sync.js'
import { APP_VERSION } from '../lib/telemetry.js'

/* 同步与推送卡片：连接微后端（注册或填令牌）→ 自动同步；推送订阅/测试。 */
export default function SyncCard() {
  const sync = useStore(s => s.sync)
  const setSync = useStore(s => s.setSync)
  const syncNow = useStore(s => s.syncNow)
  const resolveConflict = useStore(s => s.resolveConflict)
  const toast = useUI(s => s.toast)
  const [url, setUrl] = useState(sync.url)
  const [token, setToken] = useState(sync.token)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [diag, setDiag] = useState(null)

  const connected = !!(sync.url && sync.token)

  const doConnect = async () => {
    const base = url.trim().replace(/\/$/, '')
    if (!/^https?:\/\//.test(base)) {
      toast('服务器地址要以 http(s):// 开头')
      return
    }
    setBusy(true)
    try {
      let tok = token.trim()
      if (!tok) {
        if (!name.trim()) {
          toast('新用户要先起个名字')
          return
        }
        const r = await register(base, name.trim())
        if (!r.ok) {
          toast('注册失败：' + (r.data.error || r.status))
          return
        }
        tok = r.data.token
        toast(`已注册，令牌：${tok.slice(0, 8)}…（可在其他设备填同一个令牌）`)
      }
      // 首连：拉一次云端（有数据就采纳，没有就等待本机推送）
      const pull = await pullData(base, tok)
      if (!pull.ok) {
        toast('连接失败：' + (pull.data.error || pull.status))
        return
      }
      setSync({ url: base, token: tok, rev: 0, lastSync: 0, dirty: true })
      await syncNow()
      toast('已连接，同步已开启')
    } catch (err) {
      toast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const doSync = async () => {
    setBusy(true)
    try {
      const r = await syncNow()
      toast(
        {
          synced: '已同步 ✓',
          adopted: '云端较新，已采纳',
          overwritten: '本机较新，已覆盖云端',
          conflict: '同步冲突，建议先导出备份',
          off: '未连接',
          error: '同步出错',
        }[r] || r
      )
    } finally {
      setBusy(false)
    }
  }

  const doPush = async () => {
    setBusy(true)
    try {
      const r = await enablePush(sync.url, sync.token)
      toast('推送已开启' + (r.endpoint ? '' : ''))
    } catch (e) {
      toast('推送开启失败：' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const doTest = async () => {
    const r = await testPush(sync.url, sync.token)
    toast(r.ok ? `测试已发出（${r.data.sent}/${r.data.total}）` : '发送失败')
  }

  /* 差分诊断：直接经 SW 发本地通知。能看到 = 显示正常，问题在推送送达；看不到 = 通知权限/样式问题 */
  const doLocal = async () => {
    try {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification('GymGym · 本地通知测试', {
        body: '看到这条 = 通知显示正常，问题只在推送送达环节',
      })
      toast('本地通知已发出，看锁屏/横幅')
    } catch (e) {
      toast('本地通知失败：' + e.message)
    }
  }

  /* 服务端视角的诊断：各设备自报的 SW/缓存状态 + 最近崩溃 */
  const loadDiag = async () => {
    setBusy(true)
    try {
      const r = await fetchDiagnostics(sync.url, sync.token)
      if (r.ok) setDiag(r.data)
      else toast('诊断读取失败：' + (r.data.error || r.status))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <p className="dim small">
        可选功能：连上你自己的微后端后，训练数据多设备同步，休息计时结束会推送提醒到手机和手表。部署方法见仓库
        docs/SYNC_PUSH.md。
      </p>
      {!connected && (
        <>
          <input
            className="input block"
            placeholder="服务器地址，如 https://xxx.workers.dev"
            value={url}
            onChange={e => setUrl(e.target.value)}
            inputMode="url"
          />
          <div className="row">
            <input
              className="input grow"
              placeholder="昵称（新用户）"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <input
              className="input grow"
              placeholder="令牌（老用户填）"
              value={token}
              onChange={e => setToken(e.target.value)}
            />
          </div>
          <button className="btn primary block" disabled={busy} onClick={doConnect}>
            连接
          </button>
        </>
      )}
      {connected && (
        <>
          <div className="row-between">
            <span>状态</span>
            <span className="dim small mono">
              {sync.conflict
                ? '同步冲突，等待选择'
                : sync.status === 'syncing'
                  ? '同步中…'
                  : sync.status === 'error'
                    ? '同步失败，可重试'
                    : sync.dirty
                      ? '本地有数据待上传'
                      : '已同步'}
              {sync.lastSync
                ? ` · ${new Date(sync.lastSync).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 同步`
                : ''}
            </span>
          </div>
          {sync.conflict && (
            <div role="status">
              <p className="small">
                不同记录的改动已自动合并。以下记录双方都改过，请选择这些冲突记录要保留的版本；操作前会保留双方恢复点。
              </p>
              <p className="dim small">
                {sync.conflict.conflicts
                  ?.map(c => `${c.key} · ${c.local?.name || c.remote?.name || c.id}`)
                  .join('、')}
              </p>
              <div className="row">
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      const result = await resolveConflict('local')
                      toast(result === 'synced' ? '已保留本机数据并同步' : '未完成同步，请重试')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  保留本机并上传
                </button>
                <button
                  className="btn ghost"
                  disabled={busy || !sync.conflict.state}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      const result = await resolveConflict('remote')
                      toast(result === 'synced' ? '已合并云端冲突记录' : '未完成同步，请重试')
                    } catch (err) {
                      toast(err.message)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  采纳云端数据
                </button>
              </div>
            </div>
          )}
          <div className="row">
            <button className="btn primary grow" disabled={busy} onClick={doSync}>
              立即同步
            </button>
            <button className="btn ghost" disabled={busy} onClick={doPush}>
              开启推送
            </button>
          </div>
          <div className="row">
            <button className="btn ghost grow" disabled={busy} onClick={doTest}>
              推送测试（远端）
            </button>
            <button className="btn ghost grow" disabled={busy} onClick={doLocal}>
              本地通知测试
            </button>
          </div>
          <button className="btn ghost block sm" disabled={busy} onClick={loadDiag}>
            诊断（各设备 SW 状态 / 最近崩溃）
          </button>
          {diag && (
            <div
              className="dim small mono"
              style={{ marginTop: 8, maxHeight: 180, overflow: 'auto', textAlign: 'left' }}
            >
              <div>
                本机 v{APP_VERSION} · 已上报设备 {diag.devices.length} · 服务端错误 {diag.errors.length} 条
              </div>
              {diag.devices.map(d => (
                <div key={d.dev + d.t}>
                  {d.dev?.slice(0, 6)} · v{d.v} · SW{d.swActive ? '✓' : '✗'}
                  {d.swV ? `(${d.swV})` : ''} · 预缓存{d.precache} ·{' '}
                  {new Date(d.t).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              ))}
              {diag.errors.slice(0, 5).map((e, i) => (
                <div key={i} title={e.stack || ''}>
                  ✗{' '}
                  {new Date(e.t).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  v{e.v} {String(e.msg).slice(0, 90)}
                </div>
              ))}
            </div>
          )}
          <button
            className="btn ghost block sm"
            disabled={busy}
            onClick={() => {
              setSync({ url: '', token: '', uid: '', rev: 0, lastSync: 0 })
              setUrl('')
              setToken('')
              toast('已断开（本机数据保留）')
            }}
          >
            断开连接
          </button>
        </>
      )}
    </div>
  )
}
