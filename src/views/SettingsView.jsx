import { useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

export default function SettingsView() {
  const { settings, setSettings, exportState, importState, resetAll } = useStore()
  const toast = useUI(s => s.toast)
  const fileRef = useRef(null)

  const doExport = () => {
    const blob = new Blob([exportState()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `gym-gym-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('备份已导出')
  }

  const doImport = async e => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      importState(await f.text())
      toast('备份已导入')
    } catch (err) {
      toast('导入失败：' + err.message)
    }
    e.target.value = ''
  }

  return (
    <div className="page">
      <h1 className="h1">设置</h1>

      <div className="section-title">训练</div>
      <div className="card">
        <div className="row-between">
          <span>默认休息时长</span>
          <div className="row">
            {[60, 90, 120, 180].map(s => (
              <button key={s} className={'chip' + (settings.restSec === s ? ' on' : '')} onClick={() => setSettings({ restSec: s })}>{s}s</button>
            ))}
          </div>
        </div>
        <div className="row-between">
          <span>休息结束提示音</span>
          <Toggle on={settings.sound} onClick={() => setSettings({ sound: !settings.sound })} />
        </div>
        <div className="row-between">
          <span>休息结束震动</span>
          <Toggle on={settings.vibrate} onClick={() => setSettings({ vibrate: !settings.vibrate })} />
        </div>
      </div>

      <div className="section-title">数据</div>
      <div className="card">
        <p className="dim small">所有数据只存在这台手机的浏览器里，换手机不会自动带走。定期导出一份 JSON 备份。</p>
        <div className="row">
          <button className="btn primary" onClick={doExport}>导出备份</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>导入备份</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={doImport} />
        </div>
      </div>

      <div className="section-title">危险区</div>
      <div className="card">
        <button className="btn danger block" onClick={() => { if (confirm('清空全部数据？不可恢复，建议先导出备份。')) { resetAll(); toast('已清空') } }}>清空所有数据</button>
      </div>

      <div className="section-title">关于</div>
      <div className="card">
        <p className="small"><b>GymGym</b> v0.1.0 · 纯本地健身记录</p>
        <p className="dim small">
          iPhone 上用 Safari 打开后 → 分享 → 「添加到主屏幕」，即可全屏使用。
          数据存于浏览器 localStorage，添加到主屏幕后不会被系统 7 天清除。
        </p>
      </div>
    </div>
  )
}

function Toggle({ on, onClick }) {
  return <button className={'toggle' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on}><i /></button>
}
