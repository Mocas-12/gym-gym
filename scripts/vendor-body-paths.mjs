/* 从 openGym 克隆提取 MuscleMap(MIT) 人体几何数据（男体正面/背面），
 * 生成 src/data/body-paths.json 供肌肉图懒加载。
 * 数据出处：MuscleMap by Melih Colpan (MIT)，经 openGym 转换为 SVG 路径（AGPL 项目内转换）。
 * 运行：node scripts/vendor-body-paths.mjs [openGym克隆路径] */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(process.argv[2] || resolve(root, '../openGym'), 'frontend/src/lib/body-paths.js')

const raw = readFileSync(src, 'utf8')
const dataUrl = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(raw)
const { default: all } = await import(dataUrl)

const out = {
  _source: 'MuscleMap by Melih Colpan — MIT License — https://github.com/melihcolpan/MuscleMap (converted to SVG paths by openGym, AGPL)',
  front: all.male.front,
  back: all.male.back,
}
const target = resolve(root, 'src/data/body-paths.json')
writeFileSync(target, JSON.stringify(out))
console.log('written', target, JSON.stringify(out).length, 'bytes')
