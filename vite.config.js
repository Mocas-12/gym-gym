import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// base './' 相对路径：构建产物可以直接挂在任何子路径下（GitHub Pages 的 /gym-gym/）
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020' },
  // app 版本注入（诊断自报用）
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    coverage: {
      provider: 'v8',
      // 覆盖率门槛只圈纯函数领域层（可单测）；pwa/sync/use-swipe-row 是浏览器/React
      // 模块，单测环境恒为 0%，由 E2E 矩阵覆盖，圈进来只会稀释门槛的含义
      include: ['src/lib/**/*.js'],
      exclude: [
        'src/lib/**/*.test.js',
        'src/lib/types.js',
        'src/lib/pwa.js',
        'src/lib/sync.js',
        'src/lib/telemetry.js',
        'src/lib/use-swipe-row.js',
      ],
      thresholds: { statements: 85, branches: 78, functions: 85, lines: 85 },
    },
  },
})
