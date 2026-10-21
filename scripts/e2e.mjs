/* 启动真实生产预览，运行矩阵，退出时关闭预览。 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const base = process.env.E2E_URL || 'http://127.0.0.1:8930'
const server = process.env.E2E_URL
  ? null
  : spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '8930', '--strictPort'],
      { cwd, stdio: 'ignore', windowsHide: true }
    )

try {
  let ready = false
  for (let i = 0; i < 50; i++) {
    if (server?.exitCode != null) throw new Error('预览服务器启动失败（端口可能被占用）')
    try {
      ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok
    } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  if (!ready) throw new Error('预览服务器未就绪')
  const child = spawn(process.execPath, ['e2e-full.mjs'], {
    cwd,
    env: { ...process.env, E2E_URL: base },
    stdio: 'inherit',
    windowsHide: true,
  })
  process.exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => resolve(code ?? 1))
  })
} finally {
  server?.kill()
}
