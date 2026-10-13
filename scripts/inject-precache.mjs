/* 构建后处理：从 dist/index.html 提取带 hash 的资产清单，注入 dist/sw.js 的预缓存列表。
 * 让 Service Worker 安装时就能预缓存全部 hash 资产（文件名构建前不可知）。 */
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync('dist/index.html', 'utf8')
const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map(x => './' + x[1])

let sw = readFileSync('dist/sw.js', 'utf8')
const list = JSON.stringify(['./', ...assets])
if (sw.includes('/*PRECACHE_LIST*/')) {
  sw = sw.replace('/*PRECACHE_LIST*/', list)
} else {
  sw = `const PRECACHE_LIST = ${list}\n` + sw
}
writeFileSync('dist/sw.js', sw)
console.log('预缓存清单注入 sw.js:', assets.length + 1, '个文件')
