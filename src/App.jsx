import { useEffect, useState } from 'react'
import Home from './views/Home.jsx'
import WorkoutView from './views/WorkoutView.jsx'
import HistoryView from './views/HistoryView.jsx'
import PlanView from './views/PlanView.jsx'
import SettingsView from './views/SettingsView.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { useUI } from './store/useUI.js'
import RestTimer from './components/RestTimer.jsx'
import { retrySave, usePersistence } from './store/persistence.js'
import { useStore } from './store/useStore.js'

function download(json, filename) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

const TABS = ['home', 'workout', 'plan', 'history', 'settings']
const readHash = () => {
  const r = (location.hash || '').replace(/^#\/?/, '')
  return TABS.includes(r) ? r : 'home'
}

export default function App() {
  const [route, setRoute] = useState(readHash)
  const toastMsg = useUI(s => s.toastMsg)
  const restOpen = useUI(s => s.restUntil > 0)
  const { ready, loadError, error, conflict } = usePersistence()
  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (!ready)
    return (
      <div className="page">
        <h1 className="h1">GymGym</h1>
        <p role="status">{loadError || '正在等待编辑权限，请关闭另一个 GymGym 页面；释放后会自动继续。'}</p>
        {loadError && (
          <div className="row">
            <button
              className="btn ghost"
              onClick={() => download(localStorage.getItem('gym_gym_v1') || '{}', 'gym-gym-raw.json')}
            >
              导出原始备份
            </button>
            <button className="btn primary" onClick={() => location.reload()}>
              重新加载
            </button>
          </div>
        )}
      </div>
    )

  return (
    <div className="app">
      <main className={'screen' + (restOpen ? ' rest-open' : '')}>
        {error && (
          <div className="card storage-warning" role="alert">
            <strong>尚未保存</strong>
            <p>{error}</p>
            <div className="row">
              <button className="btn primary" disabled={conflict} onClick={retrySave}>
                重试保存
              </button>
              <button
                className="btn ghost"
                onClick={() => download(useStore.getState().exportState(), 'gym-gym-unsaved.json')}
              >
                导出未保存内容
              </button>
            </div>
          </div>
        )}
        {/* key=route：切页时重置边界，一页崩了不粘住其他页 */}
        <ErrorBoundary key={route}>
          {route === 'home' && <Home />}
          {route === 'workout' && <WorkoutView />}
          {route === 'plan' && <PlanView />}
          {route === 'history' && <HistoryView />}
          {route === 'settings' && <SettingsView />}
        </ErrorBoundary>
      </main>
      <RestTimer />
      <TabBar
        route={route}
        go={r => {
          location.hash = '#/' + r
        }}
      />
      {toastMsg && !error && <div className="toast">{toastMsg}</div>}
    </div>
  )
}
