export default function TabBar({ route, go }) {
  const items = [
    ['home', '首页', '⌂'],
    ['workout', '训练', '🏋'],
    ['history', '历史', '☰'],
    ['settings', '设置', '⚙'],
  ]
  return (
    <nav className="tabbar">
      {items.map(([id, label, icon]) => (
        <button key={id} className={'tab' + (route === id ? ' on' : '')} onClick={() => go(id)}>
          <span className="tab-icon">{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
