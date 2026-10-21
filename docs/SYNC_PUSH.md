# 云同步与推送（可选功能）

GymGym 本体是纯本地的，这个功能是**可选**的：连上你自己部署的微后端后，获得

1. **多设备同步**：训练数据（模板/计划/记录/体重）在手机、电脑之间自动同步
2. **Web Push 推送**：休息计时结束时推送提醒——iPhone 收到后**自动镜像到 Apple Watch**，训练时手机不在手边手表就是计时器
3. **诊断自报**（v1.1.0+）：连接同步后，客户端崩溃与 Service Worker/缓存状态自动上报到你自己的后端，设置页可查看——排查「线上到底跑的是什么版本」不再靠猜

## 架构

```
iPhone/电脑 (PWA) ──HTTPS──> Cloudflare Worker（你部署，免费额度）
   localStorage  <──409冲突保留双方──  Durable Object 存储
        ▲
   手表（iOS 自动镜像 iPhone 通知 / 快捷指令调 API）
```

- 数据模型：每用户一份 JSON 文档 + 修订号（`_rev`），push 带 `baseRev` 条件写，冲突返回 409 + 服务器文档，客户端保留双方文档，由用户选择
- 推送：标准 Web Push（VAPID + RFC 8291 加密），Worker 内实现，无第三方依赖
- 隐私：数据只有你自己（Bearer 令牌）和你的 CF 账号能看到；不想要了删掉 Worker 即归零。诊断上报同样进你自己的 KV，内容只有错误消息/栈、app 版本、UA、SW 状态——**不含任何训练数据**

## 部署步骤（约 10 分钟）

1. 注册 [Cloudflare](https://dash.cloudflare.com/sign-up) 账号（免费）
2. 本机安装 wrangler 并登录（浏览器授权一次）：

```bash
npx wrangler login
```

3. 创建 KV 存储：

```bash
cd backend
npx wrangler kv namespace create KV
# 输出里有 id = "xxxx"，填入 wrangler.toml 的 [[kv_namespaces]] id
```

4. 把 `wrangler.toml` 里 `VAPID_SUB` 的邮箱改成你自己的（推送服务商要求留联系方式）
5. 保留仓库自带的 `backend/worker.js` 和 `wrangler.toml` 中的 Durable Object 绑定及迁移配置
6. 部署（仓库里直接跑，脚本直接部署 backend/worker.js）：

```bash
npm run backend:deploy
# 输出的 https://gymgym-backend.你的子域.workers.dev 就是你的服务器地址
```

7. 验证：浏览器打开 `https://你的地址/api/health`，应显示 `{"ok":true,...}`

## App 里连接

设置 → **同步与推送（可选）**：

- 填服务器地址 + 昵称 → **连接**（自动注册，得到一个令牌）
- 其他设备：填**同一个服务器地址 + 同一个令牌** → 连接 → 存在冲突时选择要保留的数据
- **开启推送**（会请求通知权限，需先添加到主屏幕）→ **测试** 按钮验证

连接后自动同步时机：app 启动、每次改动后 60 秒内、回到前台。连接状态下还会自动上报诊断（见上）。

## Apple Watch（第二层：快捷指令）

推送开启后，休息结束提醒会自动出现在手表上（iPhone 锁屏通知的镜像）。再进一步，在手表的「快捷指令」App 里建两个指令（数据真同步，不用掏手机）：

- **记体重**：获取输入 → 「获取 URL 内容」（POST `你的服务器/api/push/test` 不适合这里——用下面的同步指令）——体重快捷指令需要第三层 API 扩展，暂未开放写入口
- **同步检查**：GET `你的服务器/api/health` → 显示返回，确认手表到服务器的链路通

> 说明：快捷指令直写训练数据的 API（第二层完整版）在路线图里，当前快捷指令主要用于验证链路与收推送。

## 限制与说明

- **文档级冲突**：两台设备离线各自修改时，由用户选择保留哪份。替换前保留一份恢复点，重要数据仍应导出备份
- **速率限制**（v1.1.0+）：Worker 对每 IP 按路由组分窗口限流（注册 5/分、读 60/分、写 30/分、推送 30/分、诊断 20/分），超限返回 429——目的是防止失控循环打爆 KV 免费写额度（1000 写/天），正常使用无感
- **休息推送**：Worker 使用 Durable Object Alarm 持久化调度。页面在后台时可能被 iOS 冻结，这正是推送兜底的场景
- **iOS 推送前提**：PWA 已添加到主屏幕（iOS 16.4+ 的要求）
- 令牌即密码：不要分享。泄露后在 CF 后台删掉 KV 里的 `auth:` 记录即可作废

## Worker 源码与升级

backend/worker.js 是部署与测试共用的唯一源码，净化逻辑复用 src/lib/normalize.js。

运行 npm run backend:deploy，Wrangler 会创建 SQLite Durable Object 绑定。
用户第一次访问时，会将旧 KV 训练文档按原修订号迁移到该用户的 Durable Object。旧 KV 数据保留作备份，之后以 Durable Object 为准。升级后不要回滚到直接写 KV 的旧 Worker，否则数据会分叉。

- 同步读写在每用户一个 Durable Object 内串行执行，必须带 baseRev；冲突返回 409。
- 双方都有修改时客户端保留冲突，由用户选择，不再按客户端时钟自动覆盖。
- 休息任务使用持久化 Alarm 调度，取消也写入相同对象，实例重启不丢任务。
- 每用户最多 100 个待发送任务；推送失败有限重试，过期超过一小时不再发送。
- Alarm 重试可能重复发送，通知使用相同 tag 合并。Web Push 无法保证精确到秒。
