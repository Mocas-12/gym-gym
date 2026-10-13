import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import InstallGuide from '../components/InstallGuide.jsx'
import { hasInstallPrompt, isStandalone, onInstallAvailability, promptInstall } from '../lib/pwa.js'
import { STANDARD_PLATES } from '../lib/plates.js'
import SyncCard from './SyncCard.jsx'

export default function SettingsView() {
  const { settings, setSettings, exportState, importState, resetAll } = useStore()
  const toast = useUI(s => s.toast)
  const fileRef = useRef(null)
  const [standalone] = useState(isStandalone)
  const [canPrompt, setCanPrompt] = useState(hasInstallPrompt)
  const [installSheet, setInstallSheet] = useState(false)
  useEffect(() => onInstallAvailability(setCanPrompt), [])
  const [vp] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio,
    sw: screen.width,
    sh: screen.height,
    standalone: isStandalone(),
  }))

  const install = async () => {
    if (canPrompt) {
      const r = await promptInstall()
      if (r === 'accepted') toast('开始安装，完成后从主屏幕打开 GymGym')
    } else {
      setInstallSheet(true) // iOS Safari：没有安装 API，走引导
    }
  }

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
              <button
                key={s}
                className={'chip' + (settings.restSec === s ? ' on' : '')}
                onClick={() => setSettings({ restSec: s })}
              >
                {s}s
              </button>
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
        <div className="row-between">
          <span>记录 RIR 努力度</span>
          <Toggle
            on={settings.showRir ?? true}
            onClick={() => setSettings({ showRir: !(settings.showRir ?? true) })}
          />
        </div>
        <p className="dim small">
          RIR = 力竭前还剩的次数余力（R0 力竭、R2 还剩 2 次）。完成一组后点 R 芯片记录。
        </p>
      </div>

      <div className="section-title">杠铃配重</div>
      <div className="card">
        <div className="row-between">
          <span>杠铃杆重量</span>
          <div className="row" style={{ marginTop: 0 }}>
            {[15, 20, 25].map(b => (
              <button
                key={b}
                className={'chip' + ((settings.plates?.bar ?? 20) === b ? ' on' : '')}
                onClick={() =>
                  setSettings({ plates: { ...(settings.plates || { avail: STANDARD_PLATES }), bar: b } })
                }
              >
                {b}kg
              </button>
            ))}
          </div>
        </div>
        <p className="dim small" style={{ marginTop: 10 }}>
          拥有的杠铃片规格（点按切换）——配重提示按这个算：
        </p>
        <div className="plan-chips">
          {STANDARD_PLATES.map(p => {
            const avail = settings.plates?.avail ?? STANDARD_PLATES
            const on = avail.includes(p)
            return (
              <button
                key={p}
                className={'chip' + (on ? ' on' : '')}
                onClick={() =>
                  setSettings({
                    plates: {
                      bar: settings.plates?.bar ?? 20,
                      avail: on ? avail.filter(x => x !== p) : [...avail, p],
                    },
                  })
                }
              >
                {p}
              </button>
            )
          })}
        </div>
      </div>

      <div className="section-title">数据</div>
      <div className="card">
        <div className="row-between">
          <span>体重目标 (kg)</span>
          <input
            className="input"
            style={{ width: 90, textAlign: 'center' }}
            inputMode="decimal"
            placeholder="不设"
            defaultValue={settings.goalKg || ''}
            onBlur={e => {
              const v = parseFloat(e.target.value)
              setSettings({ goalKg: Number.isFinite(v) && v > 20 && v < 300 ? v : null })
            }}
          />
        </div>
        <p className="dim small" style={{ marginTop: 10 }}>
          所有数据只存在这台手机的浏览器里，换手机不会自动带走。定期导出一份 JSON 备份。
        </p>
        <div className="row">
          <button className="btn primary" onClick={doExport}>
            导出备份
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            导入备份
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={doImport} />
        </div>
      </div>

      <div className="section-title">同步与推送（可选）</div>
      <SyncCard />

      <div className="section-title">添加到主屏幕</div>
      {standalone ? (
        <div className="card">
          <p className="small">✓ 已添加到主屏幕，正在全屏运行</p>
        </div>
      ) : (
        <div className="card">
          <p className="dim small">
            装到主屏幕后全屏运行、像原生 app 一样打开；数据存在本机，不会被系统 7 天清除。
          </p>
          <button className="btn primary block" onClick={install}>
            📲 添加到主屏幕
          </button>
        </div>
      )}

      {installSheet && <InstallGuide onClose={() => setInstallSheet(false)} />}

      <div className="section-title">危险区</div>
      <div className="card">
        <button
          className="btn danger block"
          onClick={() => {
            if (confirm('清空全部数据？不可恢复，建议先导出备份。')) {
              resetAll()
              toast('已清空')
            }
          }}
        >
          清空所有数据
        </button>
      </div>

      {/* 设备视口调试信息：排查真机「底栏不贴边」类问题的一手数据 */}
      <div className="page-foot dim small mono">
        GymGym v0.9.0 · {vp.w}×{vp.h} @dpr{vp.dpr} · 屏幕 {vp.sw}×{vp.sh} ·{' '}
        {vp.standalone ? '主屏幕' : '浏览器'}
      </div>
    </div>
  )
}

function Toggle({ on, onClick }) {
  return (
    <button className={'toggle' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on}>
      <i />
    </button>
  )
}
