import React from 'react'
import { reportErr } from '../lib/telemetry.js'

/* 视图级兜底：任何页面崩溃不再白/黑屏，而是显示错误信息。
 * 手机上出问题时，屏幕上的这行错误文字就是排查线索——截图发出来即可定位。 */
export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[GymGym] view crashed:', error)
    reportErr(error, 'render') // 已连同步时自动上报到用户自己的后端（fire-and-forget）
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
            <button className="btn primary" onClick={() => this.setState({ error: null })}>
              重试
            </button>
            <button className="btn ghost" onClick={this.exportRaw}>
              导出数据备份
            </button>
          </div>
          <p className="dim small" style={{ marginTop: 10, maxWidth: 320, textAlign: 'center' }}>
            你的数据都还在，没有丢失。截图这行错误反馈给开发者即可定位修复。
          </p>
        </div>
      )
    }
    return this.props.children
  }

  /* 崩溃时把原始存储导出成文件：数据可抢救，绝不在这里销毁任何东西 */
  exportRaw = () => {
    const raw = localStorage.getItem('gym_gym_v1') || '{}'
    const blob = new Blob([raw], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `gym-gym-crash-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
}
