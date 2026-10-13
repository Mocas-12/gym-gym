import { isIOS } from '../lib/pwa.js'

/* 内联小图标（iOS 风格线性图标，跟当前文字同色） */
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="il" aria-hidden>
    <path
      d="M12 14.5V3.5M8.5 7 12 3.5 15.5 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.5 10.5H7a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4a3 3 0 0 0-3-3h-.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)
const AddIcon = () => (
  <svg viewBox="0 0 24 24" className="il" aria-hidden>
    <rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 8.5v7M8.5 12h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
const AppIcon = () => (
  <svg viewBox="0 0 24 24" className="il" aria-hidden>
    <rect x="5.5" y="10.2" width="13" height="3.6" rx="1.8" fill="currentColor" opacity="0.55" />
    <rect x="3.5" y="6.5" width="3.8" height="11" rx="1.5" fill="currentColor" />
    <rect x="16.7" y="6.5" width="3.8" height="11" rx="1.5" fill="currentColor" />
  </svg>
)

const IOS_STEPS = [
  { icon: <ShareIcon />, t: '点「分享」按钮', d: 'Safari 底部工具栏中间，方框加向上箭头的那个' },
  { icon: <AddIcon />, t: '选「添加到主屏幕」', d: '在弹出的菜单里向下滑动，找到这一项' },
  { icon: <AppIcon />, t: '点「添加」完成', d: '主屏幕出现 GymGym 图标，点开即是全屏 app' },
]
const OTHER_STEPS = [
  { icon: <ShareIcon />, t: '打开浏览器菜单', d: '右上角的「⋮」（三个点）' },
  { icon: <AddIcon />, t: '选「安装应用」或「添加到主屏幕」', d: '在菜单里找到这一项，名称因浏览器而异' },
  { icon: <AppIcon />, t: '确认安装', d: '主屏幕出现 GymGym 图标，点开即是全屏 app' },
]

/* 「添加到主屏幕」引导抽屉：按平台给对应步骤，两行式排版（标题+说明）保持整齐 */
export default function InstallGuide({ onClose }) {
  const steps = isIOS() ? IOS_STEPS : OTHER_STEPS
  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <b>把 GymGym 装到主屏幕</b>
        </div>
        <div className="sheet-body">
          <div className="guide">
            {steps.map((s, i) => (
              <div className="guide-step" key={i}>
                <span className="guide-n">{i + 1}</span>
                <div className="guide-body">
                  <div className="guide-t">
                    {s.icon}
                    {s.t}
                  </div>
                  <div className="guide-d">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="dim small guide-note">数据存在这台手机的浏览器里，装成 app 后不会被系统 7 天清除。</p>
          <button className="btn primary block" onClick={onClose}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  )
}
