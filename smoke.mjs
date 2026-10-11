/* 端到端冒烟测试：先 npm run build && npm run preview，再 node smoke.mjs
 * 浏览器优先用 playwright 默认安装，找不到时回退到本机缓存路径。 */
import { chromium } from 'playwright'

const FALLBACK = 'C:/Users/wangqixiu/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
const launch = async () => {
  try { return await chromium.launch() }
  catch { return await chromium.launch({ executablePath: process.env.CHROME_PATH || FALLBACK }) }
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
await page.goto('http://localhost:8901/')
await page.waitForTimeout(800)
const h1 = await page.textContent('h1')
console.log('H1:', h1)
// 从模板开始训练 → 训练页
await page.click('text=推日')
await page.waitForTimeout(500)
console.log('workout head:', await page.textContent('.workout-head .h2'))
// 勾选第一组完成 → 休息条出现
await page.click('.done-btn >> nth=0')
await page.waitForTimeout(300)
console.log('restbar visible:', await page.isVisible('.restbar'))
// 添加动作（抽屉）
await page.click('text=＋ 添加动作')
await page.waitForTimeout(400)
await page.click('text=硬拉')
await page.click('.sheet .btn.primary')
await page.waitForTimeout(300)
console.log('entries:', await page.locator('.entry').count())
// 完成训练
await page.click('text=完成')
await page.waitForTimeout(400)
// 历史页
await page.click('.tabbar >> text=历史')
await page.waitForTimeout(400)
console.log('history cards:', await page.locator('.card').count())
if (errors.length) { console.error('ERRORS:', errors.join(' | ')); process.exit(1) }
console.log('ERRORS: none')
await browser.close()
