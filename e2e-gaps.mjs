/* 补充测试：离线可用性、数据迁移链、大数据量性能 */
import { chromium } from 'playwright'

const BASE = process.env.E2E_URL || 'http://localhost:8930'
const browser = await chromium.launch({ executablePath: 'C:/Users/wangqixiu/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' })
const results = []
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail])
const errors = []

/* 1) 离线可用性：首装 → 离线 → 重载应从 SW 缓存渲染 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800) // 等 SW 安装接管
  await ctx.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(800)
  const ok = await page.evaluate(() => document.querySelector('.tabbar') && document.querySelector('h1'))
  check('H1 离线打开（SW 缓存兜底）', !!ok)
  await ctx.close()
}

/* 2) 迁移链：v1 形态老数据 → 启动 → v4 + 净化 + 功能可用 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    // v1 形态：无 plan/sync、routine 无 cfg/supersets、workouts 带脏数据
    localStorage.setItem('gym_gym_v1', JSON.stringify({
      state: {
        settings: { restSec: 90 },
        workouts: [null, { id: 'old1', name: '旧记录', start: Date.now() - 864e5, entries: [{ exId: 'bench', name: '卧推', sets: [{ kg: 60, reps: 8, done: true }] }] }],
        bodyweight: [{ d: 'x', kg: 70 }],
      },
      version: 1,
    }))
  })
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600)
  const migrated = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('gym_gym_v1'))
    return { version: p.version, plan: !!p.state.plan, cleaned: p.state.workouts.length === 1, hasCfg: !!p.state.routines[0]?.cfg }
  })
  check('H2 v1→v4 迁移（plan/cfg/净化）', migrated.version === 4 && migrated.plan && migrated.cleaned && migrated.hasCfg)
  await page.click('.tabbar >> text=历史'); await page.waitForTimeout(300)
  check('H3 迁移后历史可用', (await page.locator('.card:has(.card-open)').count()) === 1)
  await ctx.close()
}

/* 3) 性能：300 次训练 × 5 动作 → 历史页渲染时间 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    const mk = (id, i) => ({
      id: 'w' + i, name: '推日 ' + i, start: Date.now() - i * 864e5, end: Date.now() - i * 864e5 + 36e5,
      volume: 3000, entries: [0, 1, 2, 3, 4].map(k => ({
        exId: 'ex' + k, name: '动作' + k, type: 'reps', sets: [0, 1, 2].map(j => ({ kg: 60 + j * 5, reps: 8, done: true })),
      })),
    })
    const workouts = Array.from({ length: 300 }, (_, i) => mk(i, i))
    const raw = JSON.parse(localStorage.getItem('gym_gym_v1') || '{"state":{}}')
    raw.state = raw.state || {}
    raw.state.workouts = workouts
    localStorage.setItem('gym_gym_v1', JSON.stringify(raw))
  })
  const t0 = Date.now()
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300)
  await page.click('.tabbar >> text=历史'); await page.waitForTimeout(200)
  const t1 = Date.now()
  const renderMs = await page.evaluate(() => performance.getEntriesByName ? 0 : 0)
  console.log('历史页切换耗时(含点击延迟):', t1 - t0, 'ms')
  check('I1 300 条历史渲染', (await page.locator('.card:has(.card-open)').count()) === 300)
  const t2 = Date.now()
  await page.click('.tabbar >> text=历史'); await p_scrollBottom(page)
  const t3 = Date.now()
  console.log('滚动到底耗时:', t3 - t2, 'ms')
  check('I2 无崩溃', (await page.locator('h1').count()) === 1)
  await ctx.close()
}
async function p_scrollBottom(p) {
  await p.evaluate(() => { const s = document.querySelector('.screen'); if (s) s.scrollTop = s.scrollHeight })
  await p.waitForTimeout(500)
}

await browser.close()
const fails = results.filter(r => r[0] === 'FAIL')
for (const r of results) console.log(r.join('  '))
console.log(fails.length ? '失败 ' + fails.length : '全部通过')
