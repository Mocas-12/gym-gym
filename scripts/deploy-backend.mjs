/* 直接部署 backend/worker.js，避免换行符提取问题与共享临时目录，
 * Wrangler 负责打包依赖和配置 Durable Object。
 * 运行：node scripts/deploy-backend.mjs（需 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID 环境变量） */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

execSync('npx wrangler deploy --config backend/wrangler.toml', {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
})
