/* 构建后处理：枚举 dist/assets，将全部资产注入 dist/sw.js 的预缓存列表。
 * 让 Service Worker 安装时就能预缓存全部 hash 资产（文件名构建前不可知）。 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

// 包含懒加载模块，首次访问首页后离线进入历史页也能加载肌肉图。
const assets = [
  ...readdirSync('dist/assets').map(name => './assets/' + name),
  './manifest.webmanifest',
  ...readdirSync('dist/icons').map(name => './icons/' + name),
]

let sw = readFileSync('dist/sw.js', 'utf8')
const list = JSON.stringify(['./', ...assets])
if (sw.includes('/*PRECACHE_LIST*/')) {
  sw = sw.replace('/*PRECACHE_LIST*/', list)
} else {
  sw = `const PRECACHE_LIST = ${list}\n` + sw
}
writeFileSync('dist/sw.js', sw)
console.log('预缓存清单注入 sw.js:', assets.length + 1, '个文件')
