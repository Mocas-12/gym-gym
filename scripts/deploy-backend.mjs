/* 部署微后端：从 docs/SYNC_PUSH.md 提取已审查的 Worker 代码到临时目录，
 * 连同 wrangler.toml 一起交给 wrangler deploy（部署产物不入库）。
 * 运行：node scripts/deploy-backend.mjs（需 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID 环境变量） */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const md = readFileSync(resolve(root, 'docs', 'SYNC_PUSH.md'), 'utf8')
const m = md.match(/```js\n([\s\S]*?)\n```/)
if (!m) throw new Error('docs/SYNC_PUSH.md 里找不到 ```js 代码块')
const code = m[1]

const dir = join(tmpdir(), 'gymgym-backend')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'worker.js'), code)
copyFileSync(resolve(root, 'backend', 'wrangler.toml'), join(dir, 'wrangler.toml'))
console.log('提取 worker.js →', dir, `(${code.length} bytes)`)
execSync('npx wrangler deploy', { cwd: dir, stdio: 'inherit' })
