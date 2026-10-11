# GymGym 🏋️

**纯本地的健身训练记录 app。** iPhone 添加到主屏幕即全屏使用，数据只存在你自己手机的浏览器里——没有账号、没有服务器、没有订阅。

灵感与架构来自对 [openGym](https://github.com/DuarteSantos8/openGym) 的分析：React + 单一 Zustand store + localStorage，把"同步/后端/账号"整个砍掉，只留下记录本身。

## 功能（v0.1）

- **训练**：从模板（推/拉/腿/全身）或空白开始，组数 × 次数 × 重量，勾选完成即启动休息倒计时
- **重量自动带出**：每个动作自动预填你上次练的重量和组数（openGym 的核心体验）
- **休息计时**：倒计时条常驻底部，结束蜂鸣 + 震动；训练时屏幕常亮（Wake Lock）
- **PR 检测**：收尾时按 Epley 估计 1RM，超过历史最佳自动标记 🎉
- **体重**：每日记录 + 曲线
- **历史**：本月容量/次数统计、每动作最佳、可展开查看每一组
- **备份**：一键导出/导入 JSON（设置页）

## 技术栈

React 19 + Vite + Zustand 5，运行时依赖只有这三个。无路由库（hash 导航）、无 UI 框架（手写 CSS）、无后端。

```bash
npm install
npm run dev        # 本地开发
npm test           # 领域逻辑单测（1RM、容量、PR、预填）
npm run build      # 构建到 dist/
npm run icons      # 重新生成应用图标（纯 Node 手写 PNG 编码）
```

## iPhone 安装

1. Safari 打开线上地址（或局域网开发地址）
2. 分享 → **添加到主屏幕**
3. 从主屏幕打开即全屏 app；其 localStorage 不会被 iOS 的 7 天清除策略回收（普通 Safari 标签页才会）

## Apple Watch 路线

| 阶段 | 能做到 | 依赖 |
|---|---|---|
| 现在 | 训练/休息提醒通过 iOS 通知镜像到手表（需先接入 Web Push） | 需要一个小推送后端 |
| 之后 | 原生 watchOS app（手表独立计时/记录） | Mac + Xcode，或 GitHub Actions macOS runner 构建未签名 ipa + Windows 上 Sideloadly 签名（7 天续签） |

数据模型刻意保持"一个 JSON 文档"（openGym 同款思路），未来接任何后端或 watch app 都不用迁移。

## 部署

GitHub Actions 已配好（`.github/workflows/deploy.yml`）：push 到 `main` 自动测试 + 构建并发布到 GitHub Pages。仓库 Settings → Pages → Source 选 **GitHub Actions** 即可。

## License

MIT
