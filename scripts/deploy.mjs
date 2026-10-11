/* 零 Actions 的部署：构建 → 把 dist/ 的内容推到 gh-pages 分支根（孤儿提交）。
 * 用临时 GIT_INDEX_FILE 构建"只含 dist 内容"的树，不污染主索引。
 * 前提：仓库 Pages 源设为 gh-pages 分支根目录（已开启，无需再管）。
 * 运行：npm run deploy */
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const sh = (cmd, opt = {}) => {
  const { quiet, ...rest } = opt
  return execSync(cmd, { stdio: quiet ? 'ignore' : ['inherit', 'pipe', 'inherit'], ...rest })
}
const shOut = (cmd, opt = {}) => sh(cmd, { encoding: 'utf8', ...opt }).trim()

sh('npm run build')
fs.writeFileSync('dist/.nojekyll', '') // 纯静态，跳过 GitHub 的 Jekyll 处理

// 临时索引：dist 内容 → 一个独立的树对象
const tmpIndex = '.git/gg-deploy-index'
fs.rmSync(tmpIndex, { force: true })
const env = { env: { ...process.env, GIT_INDEX_FILE: tmpIndex } }
sh('git read-tree --empty', { ...env, quiet: true })
sh('git add -f dist', { ...env, quiet: true })
const full = shOut('git write-tree', env)
const distTree = shOut(`git rev-parse ${full}:dist`, env) // dist 子树的根就是我们要的站点根
fs.rmSync(tmpIndex, { force: true })

const parent = shOut('git rev-parse refs/heads/gh-pages 2>/dev/null || true')
const msg = `deploy: ${new Date().toISOString()}`
const commit = parent
  ? shOut(`git commit-tree ${distTree} -p ${parent} -m "${msg}"`)
  : shOut(`git commit-tree ${distTree} -m "${msg}"`)
sh(`git update-ref refs/heads/gh-pages ${commit}`, { quiet: true })
sh('git push -f origin gh-pages')
console.log('gh-pages 已更新 →', commit)
