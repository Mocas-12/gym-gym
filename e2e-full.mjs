/* 全功能端到端矩阵：四大页面全部功能 + 脏数据健壮性 + 多机型。
 * 运行：npm run build && npm run preview & ；node e2e-full.mjs */
import { chromium, webkit } from 'playwright'

const BASE = process.env.E2E_URL || 'http://localhost:8930'
const browser = await (process.env.E2E_BROWSER === 'webkit'
  ? webkit.launch()
  : chromium.launch({ executablePath: process.env.CHROME_PATH || undefined }))
const results = []
const check = (name, ok, detail = '') => {
  results.push([ok ? 'PASS' : 'FAIL', name, detail])
  if (!ok && detail) results.push(['INFO', name + ' 详情', detail])
}
const errors = []

async function fresh(seed) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message))
  page.on('console', m => {
    if (m.type() === 'error') errors.push('[console] ' + m.text())
  })
  page.on('dialog', d => d.accept())
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  if (seed) {
    await page.evaluate(s => {
      localStorage.setItem(
        'gym_gym_v1',
        JSON.stringify({
          state: { settings: { restSec: 90, sound: true, vibrate: true, showRir: true }, ...s },
          version: 5,
        })
      )
    }, seed)
    await page.reload({ waitUntil: 'networkidle' })
  }
  await page.waitForTimeout(600)
  return page
}

/* ============ A. 首页 ============ */
{
  const p = await fresh({ workouts: [], bodyweight: [{ d: '2026-10-05', t: 1, kg: 73.2 }], customEx: [] })
  check('A1 首页渲染', (await p.textContent('h1')) === 'GymGym')
  check('A2 模板卡片 4+自由', (await p.locator('.start-card').count()) === 5)
  // 体重记录
  await p.fill('.card:has(.section-title) input, form input', '72.5')
  await p.click('button:has-text("记录")')
  await p.waitForTimeout(600)
  check('A3 体重记录显示', (await p.textContent('.big-num')).includes('72.5'))
  await p.fill('input[placeholder*="这里更新"]', '71.8')
  await p.click('button:has-text("记录")')
  await p.waitForTimeout(600)
  check(
    'A4 体重更新+曲线',
    (await p.locator('.spark').count()) === 1,
    '曲线数 ' + (await p.locator('.spark').count())
  )
  // 今日安排（周一=推日）
  check('A5 今日安排卡', (await p.locator('.today-card, .rest-card').count()) === 1)
  await p.close()
}

/* ============ B. 训练页 ============ */
{
  const p = await fresh({})
  // 固定从「推日」开始（首动作=杠铃卧推，B5 依赖杠铃配重行）。
  // 不能点 today-card：它随星期几变化（周三=拉日，首动作自重），曾造成 B5 日期相关假失败
  await p.click('.start-card:has-text("推日")')
  await p.waitForTimeout(500)
  check('B1 训练页打开', await p.isVisible('.workout-head'))
  check('B2 预填组存在', (await p.locator('.set-row').count()) > 0)
  // 快捷方案 4×12@12
  const entry = p.locator('.entry').first()
  await entry.locator('.scheme-in').nth(0).fill('4')
  await entry.locator('.scheme-in').nth(1).fill('12')
  await entry.locator('.scheme-in').nth(2).fill('12')
  await entry.locator('button:has-text("生成")').click()
  await p.waitForTimeout(200)
  check('B3 快捷方案生成 4 组', (await entry.locator('.set-row').count()) === 4)
  check('B4 组内 kg=12', (await entry.locator('.set-input').first().inputValue()) === '12')
  // 杠铃配重行（卧推 最后一组 72.5）
  const lastKg = entry.locator('.set-input').nth(6)
  await lastKg.fill('72.5')
  await p.waitForTimeout(400)
  const plate = await entry
    .locator('.plate-line')
    .textContent()
    .catch(() => '(无)')
  check('B5 配重行', plate.includes('每边') && plate.includes('25'), plate)
  // 勾选完成 → RIR
  await entry.locator('.done-btn').first().click()
  await p.waitForTimeout(200)
  check('B6 RIR 芯片出现', (await entry.locator('.rir-chip').count()) === 1)
  await entry.locator('.rir-chip').first().click()
  await p.waitForTimeout(100)
  check('B7 RIR 点按循环', (await entry.locator('.rir-chip').first().textContent()).includes('R4'))
  // 热身组（点组号）
  await entry.locator('.set-n-btn').first().click()
  await p.waitForTimeout(100)
  check('B8 热身组标记', (await entry.locator('.set-n-btn.warm').count()) === 1)
  // 休息条 + 加 30s
  check('B9 休息条出现', await p.isVisible('.restbar'))
  const before = await p.textContent('.rest-num')
  await p.click('text=+30s')
  await p.waitForTimeout(2500)
  check('B10 +30s 生效', (await p.textContent('.rest-num')) !== before)
  // 有氧：添加跑步机
  await p.click('text=＋ 添加动作')
  await p.waitForTimeout(400)
  await p.fill('.sheet-head input', '跑步机')
  await p.waitForTimeout(300)
  await p.click('.pick:has-text("跑步机")')
  await p.waitForTimeout(150)
  await p.click('.sheet-head .btn.primary')
  await p.waitForTimeout(300)
  const cardio = p.locator('.entry:has-text("跑步机")')
  check('B11 有氧三字段', (await cardio.locator('.set-input').count()) === 3)
  // 计时：添加平板支撑
  await p.click('text=＋ 添加动作')
  await p.waitForTimeout(400)
  await p.fill('.sheet-head input', '平板支撑')
  await p.waitForTimeout(300)
  await p.click('.pick:has-text("平板支撑")')
  await p.waitForTimeout(150)
  await p.click('.sheet-head .btn.primary')
  await p.waitForTimeout(300)
  check('B12 计时秒字段', (await p.locator('.entry:has-text("平板支撑") .set-input').count()) === 1)
  // 完成 → 保存
  await p.click('text=完成')
  await p.waitForTimeout(400)
  check('B13 完成保存', !(await p.isVisible('.workout-head')))
  await p.close()
}

/* ============ C. 计划页 ============ */
{
  const p = await fresh({})
  await p.click('.tabbar >> text=计划')
  await p.waitForTimeout(300)
  check('C1 7 天排课', (await p.locator('.plan-day').count()) === 7)
  await p.click('text=顺序轮换')
  await p.waitForTimeout(250)
  check('C2 轮换 3 项', (await p.locator('.rot-row').count()) === 3)
  // 模板编辑器：推日 → 改 Greyskull → 加超级组
  await p.click('button.card:has-text("推日")')
  await p.waitForTimeout(400)
  await p.click('.edit-row:has-text("上斜哑铃卧推") .chip')
  await p.waitForTimeout(150)
  check('C3 超级组开启', (await page2count(p, '.section-title:has-text("动作")')).includes('超级组'))
  await p.locator('.num-field:has-text("加重") input').fill('5')
  await p.click('text=保存模板')
  await p.waitForTimeout(300)
  check(
    'C4 保存后副标题更新',
    (await p.locator('button.card:has-text("推日") .dim.small').textContent()).includes('+5kg')
  )
  await p.close()
}
function page2count(p, sel) {
  return p.locator(sel).first().textContent()
}

/* ============ D. 历史页 ============ */
{
  const p = await fresh({
    workouts: [0, 3, 7].map((d, i) => ({
      id: 'w' + i,
      name: '推日',
      rid: 'push',
      start: Date.now() - d * 864e5,
      end: Date.now() - d * 864e5 + 36e5,
      volume: 2000 + i,
      entries: [
        {
          exId: 'bench',
          name: '杠铃卧推',
          type: 'reps',
          m: '胸',
          eq: '杠铃',
          sets: [{ kg: 60 + i * 2.5, reps: 8, done: true, rir: 2 }],
        },
        { exId: 'plank', name: '平板支撑', type: 'time', m: '核心', sets: [{ sec: 60, done: true }] },
      ],
    })),
    bodyweight: [
      { d: '2026-10-08', t: 1, kg: 73 },
      { d: '2026-10-10', t: 2, kg: 72.4 },
    ],
  })
  await p.click('.tabbar >> text=历史')
  await p.waitForTimeout(500)
  check('D1 统计卡渲染', (await p.locator('.stat-row .card').count()) === 3)
  check(
    'D2 1RM 曲线',
    (await p.locator('.ex-chips .chip').count()) >= 1 && (await p.locator('.spark').count()) >= 1
  )
  const hmCount = await p.locator('.hm-cell').count()
  check('D3 热力图渲染', hmCount >= 364 && hmCount % 7 === 0, '实际 ' + hmCount)
  check('D4 肌肉图双视图', (await p.locator('.bm-v').count()) === 2)
  await p.click('text=恢复')
  await p.waitForTimeout(200)
  check('D5 肌肉图恢复模式', (await p.locator('.bm-m:not(.l0)').count()) > 0)
  // 记录详情：计时+力量+RIR 显示
  await p.click('.card-open >> nth=0')
  await p.waitForTimeout(250)
  const allDetail = (await p.locator('.detail .mono').allTextContents()).join(' | ')
  check('D6 详情含秒/RIR', allDetail.includes('秒') && allDetail.includes('R2'), allDetail)
  // 编辑 → 改日期 → 保存
  await p.click('text=编辑')
  await p.waitForTimeout(300)
  await p.fill('input[type=date]', new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10))
  await p.click('.sheet .btn.primary:has-text("保存")')
  await p.waitForTimeout(300)
  check('D7 编辑保存无崩溃', (await p.locator('h1').textContent()) === '历史')
  // 体重目标线
  await p.click('.tabbar >> text=设置')
  await p.waitForTimeout(250)
  await p.fill('input[placeholder="不设"]', '70')
  await p.locator('input[placeholder="不设"]').blur()
  await p.waitForTimeout(200)
  await p.click('.tabbar >> text=历史')
  await p.waitForTimeout(300)
  check('D8 目标虚线', (await p.locator('.spark line').count()) >= 1)
  // 删除记录（确认流程）
  const cardsBefore = await p.locator('.card:has(.card-open)').count()
  await p.click('.card-open >> nth=0')
  await p.waitForTimeout(200)
  await p.locator('button:has-text("删除")').last().click()
  await p.waitForTimeout(200)
  await p.locator('button:has-text("确认删除")').last().click()
  await p.waitForTimeout(400)
  check(
    'D9 删除记录',
    (await p.locator('.card:has(.card-open)').count()) === cardsBefore - 1,
    `前${cardsBefore} 后${await p.locator('.card:has(.card-open)').count()}`
  )
  await p.close()
}
/* ============ E. 设置页 ============ */
{
  const p = await fresh({})
  await p.click('.tabbar >> text=设置')
  await p.waitForTimeout(300)
  check('E1 休息时长 chips', (await p.locator('.chip:has-text("90s")').count()) === 1)
  check('E2 RIR 开关', await p.isVisible('text=记录 RIR 努力度'))
  check('E3 配重卡', await p.isVisible('text=杠铃配重'))
  check('E4 备份按钮', await p.isVisible('text=导出备份'))
  check('E5 安装卡（浏览器态显示按钮）', await p.isVisible('text=📲 添加到主屏幕'))
  // 模拟服务不可用，避免 DNS/跨域错误在不同引擎产生不一致的浏览器事件。
  await p.evaluate(() => {
    const original = window.fetch.bind(window)
    window.fetch = (url, options) =>
      String(url).includes('/unavailable/')
        ? Promise.reject(new TypeError('offline'))
        : original(url, options)
  })
  await p.fill('input[placeholder*="服务器地址"]', BASE + '/unavailable')
  await p.fill('input[placeholder*="昵称"]', '矩阵测试')
  await p.locator('button:has-text("连接")').last().click()
  await p.waitForTimeout(900)
  check(
    'E6 假地址友好报错',
    (
      await p
        .locator('.toast')
        .textContent()
        .catch(() => '')
    ).includes('无法连接')
  )
  await p.close()
}

/* ============ F. 脏数据健壮性 ============ */
{
  const p = await fresh({
    workouts: [
      null,
      { id: 'bad' },
      {
        id: 'ok',
        entries: [{ exId: 'bench', name: '卧推', type: 'reps', sets: [{ kg: 60, reps: 8, done: true }] }],
      },
      {
        id: 'w-null-entry',
        entries: [
          null,
          { exId: 'squat', name: '深蹲', type: 'reps', sets: [{ kg: 100, reps: 5, done: true }] },
        ],
      },
    ],
    bodyweight: [null, { d: 'x', kg: 70 }],
    customEx: [null, { id: 'c1', n: '自定' }],
    plan: { mode: 'rotation', rotation: [null, 'push'] },
  })
  for (const tab of ['首页', '训练', '计划', '历史', '设置']) {
    await p.click(`.tabbar >> text=${tab}`)
    await p.waitForTimeout(250)
    // 训练页无 h1（空态设计），以无页面错误 + 内容可见为准
    const ok =
      errors.filter(e => e.includes('pageerror')).length === 0 && (await p.locator('.page').count()) >= 1
    check('F 五页脏数据不崩: ' + tab, ok)
  }
  check(
    'F2 存储自愈写回',
    await p.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('gym_gym_v1')).state
      return !s.workouts.some(w => !w || !Array.isArray(w.entries)) && s.workouts.length === 2
    })
  )
  await p.close()
}

/* ============ G. 多机型 ============ */
for (const [w, h, name] of [
  [375, 667, 'SE'],
  [430, 932, 'ProMax'],
  [1280, 800, '桌面'],
]) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, isMobile: w < 800 })
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(500)
  const hscroll = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const gap = await p.evaluate(() =>
    Math.round(innerHeight - document.querySelector('.tabbar').getBoundingClientRect().bottom)
  )
  check(`G ${name} 无横滚+底栏贴合`, hscroll === 0 && gap === 0, `横滚${hscroll} gap${gap}`)
  await p.close()
}

/* ============ H. 数据可靠性回归 ============ */
{
  const p = await fresh({})
  await p.locator('.start-card').first().click()
  await p.locator('.workout-head button:has-text("完成")').click()
  check(
    'H1 空训练完成后保留草稿',
    await p.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('gym_gym_v1')).state
      return !!state.active && state.workouts.length === 0
    })
  )
  await p.locator('.done-btn').first().click()
  await p.click('.tabbar >> text=计划')
  check('H2 计划页也显示休息计时', await p.isVisible('.restbar'))
  await p.click('.tabbar >> text=设置')
  await p.locator('input[type="file"]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        app: 'gym-gym',
        workouts: [],
        bodyweight: [{ d: '2026-10-21', t: Date.now(), kg: 75 }],
      })
    ),
  })
  await p.getByRole('button', { name: '确认导入' }).waitFor()
  check(
    'H3 导入先预览，不立即替换',
    (await p.isVisible('text=确认导入')) &&
      (await p.evaluate(() => !!JSON.parse(localStorage.getItem('gym_gym_v1')).state.active))
  )
  await p.click('button:has-text("确认导入")')
  await p.click('button:has-text("恢复上次数据")')
  check(
    'H4 恢复点能恢复导入前的训练',
    await p.evaluate(() => !!JSON.parse(localStorage.getItem('gym_gym_v1')).state.active)
  )
  await p.close()
}

{
  const p = await fresh({})
  await p.route('https://sync.test/**', async route => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type,authorization',
      'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const path = new URL(route.request().url()).pathname
    if (path === '/api/data' && route.request().method() === 'GET') {
      return route.fulfill({
        headers,
        json: { rev: 2, state: { workouts: [], bodyweight: [{ d: '2026-10-21', t: Date.now(), kg: 80 }] } },
      })
    }
    return route.fulfill({ headers, json: {} })
  })
  await p.fill('form input', '72')
  await p.click('button:has-text("记录")')
  await p.click('.tabbar >> text=设置')
  await p.fill('input[placeholder*="服务器地址"]', 'https://sync.test')
  await p.fill('input[placeholder*="令牌"]', 'audit.token')
  await p.getByRole('button', { name: '连接', exact: true }).click()
  await p.getByRole('button', { name: '采纳云端数据' }).waitFor()
  check(
    'H5 首次连接冲突保留本机数据',
    await p.evaluate(() => JSON.parse(localStorage.getItem('gym_gym_v1')).state.bodyweight[0].kg === 72)
  )
  await p.getByRole('button', { name: '采纳云端数据' }).click()
  check(
    'H6 采纳云端后可恢复本机记录',
    await p.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('gym_gym_v1')).state
      return (
        state.bodyweight[0].kg === 80 &&
        JSON.parse(state.recovery.json).bodyweight[0].kg === 72 &&
        !state.sync.dirty
      )
    })
  )
  await p.close()
}

{
  const p = await fresh()
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 })
  await p.context().setOffline(true)
  await p.click('.tabbar >> text=历史')
  await p.locator('.bm-v').first().waitFor()
  check('H7 首次进入历史页可离线加载肌肉图', (await p.locator('.bm-v').count()) === 2)
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.locator('.bm-v').first().waitFor()
  check('H8 离线刷新保留应用外壳与懒加载模块', (await p.textContent('h1')) === '历史')
  await p.context().setOffline(false)
  await p.close()
}

await browser.close()
const fails = results.filter(r => r[0] === 'FAIL')
console.log('========== 测试矩阵 ==========')
for (const r of results) if (r[0] !== 'INFO') console.log(r.join('  '))
console.log('========== 汇总 ==========')
console.log(
  `通过 ${results.filter(r => r[0] === 'PASS').length} / ${results.filter(r => r[0] === 'PASS').length + fails.length}`
)
if (fails.length) {
  console.log('失败项:')
  fails.forEach(f => console.log(' ✗ ' + f[1] + ' ' + f[2]))
}
if (errors.length) {
  console.log('页面错误:')
  errors.slice(0, 5).forEach(e => console.log(' ' + e))
} else console.log('零控制台错误')
process.exit(fails.length || errors.length ? 1 : 0)
