import { useEffect, useState } from 'react'
import Home from './views/Home.jsx'
import WorkoutView from './views/WorkoutView.jsx'
import HistoryView from './views/HistoryView.jsx'
import PlanView from './views/PlanView.jsx'
import SettingsView from './views/SettingsView.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { useUI } from './store/useUI.js'

const TABS = ['home', 'workout', 'plan', 'history', 'settings']
const readHash = () => {
  const r = (location.hash || '').replace(/^#\/?/, '')
  return TABS.includes(r) ? r : 'home'
}

export default function App() {
  const [route, setRoute] = useState(readHash)
  const toastMsg = useUI(s => s.toastMsg)
  const restOpen = useUI(s => s.restUntil > 0)
  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="app">
      <main className={'screen' + (restOpen ? ' rest-open' : '')}>
        {/* key=route：切页时重置边界，一页崩了不粘住其他页 */}
        <ErrorBoundary key={route}>
          {route === 'home' && <Home />}
          {route === 'workout' && <WorkoutView />}
          {route === 'plan' && <PlanView />}
          {route === 'history' && <HistoryView />}
          {route === 'settings' && <SettingsView />}
        </ErrorBoundary>
      </main>
      <TabBar route={route} go={r => { location.hash = '#/' + r }} />
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  )
}
