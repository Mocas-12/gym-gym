/* 底部标签栏：线性 SVG 图标（SF Symbols 风格描边），选中态荧光绿 + 药丸底光 */

function I({ active, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="23"
      height="23"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

const ICONS = {
  home: a => (
    <I active={a}>
      <path d="M4.5 10.8 12 4.8l7.5 6" />
      <path d="M6.3 9.5V19a.8.8 0 0 0 .8.8h3.4v-5.2h3v5.2h3.4a.8.8 0 0 0 .8-.8V9.5" />
    </I>
  ),
  workout: a => (
    <I active={a}>
      <path d="M4 9.5v5M7 7v10M17 7v10M20 9.5v5M7 12h10" />
    </I>
  ),
  plan: a => (
    <I active={a}>
      <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
      <path d="M4 10.2h16M8.2 3.4v4M15.8 3.4v4" />
    </I>
  ),
  history: a => (
    <I active={a}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6V12l3.1 2" />
    </I>
  ),
  settings: a => (
    <I active={a}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    </I>
  ),
}

export default function TabBar({ route, go }) {
  const items = [
    ['home', '首页'],
    ['workout', '训练'],
    ['plan', '计划'],
    ['history', '历史'],
    ['settings', '设置'],
  ]
  return (
    <nav className="tabbar">
      {items.map(([id, label]) => {
        const on = route === id
        return (
          <button key={id} className={'tab' + (on ? ' on' : '')} onClick={() => go(id)}>
            <span className="tab-icon">{ICONS[id](on)}</span>
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
