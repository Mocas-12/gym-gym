import React from 'react'

/* 视图级兜底：任何页面崩溃不再白/黑屏，而是显示错误信息。
 * 手机上出问题时，屏幕上的这行错误文字就是排查线索——截图发出来即可定位。 */
export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[GymGym] view crashed:', error)
  }

  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error)
      return (
        <div className="page empty-page">
          <div className="empty-icon">⚠️</div>
          <p className="small">这个页面出错了，其他页面不受影响</p>
          <p className="dim small mono err-text">{msg}</p>
          <div className="row">
            <button className="btn primary" onClick={() => this.setState({ error: null })}>重试</button>
            <button
              className="btn ghost"
              onClick={() => {
                if (confirm('清空本机全部数据并重启？不可恢复，建议先截图这行错误反馈。')) {
                  localStorage.clear()
                  location.reload()
                }
              }}
            >清空数据重启</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
