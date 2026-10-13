/* 无依赖生成应用图标 PNG（纯 Node + zlib 手写 PNG 编码）。
 * 运行：npm run icons  →  public/icons/*.png */
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
const crc32 = buf => {
  let c = ~0
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
const encodePNG = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* 在 S×S 画布上画：深色圆角底 + 荧光绿杠铃 */
function drawIcon(S) {
  const px = new Uint8Array(S * S * 4)
  const put = (x, y, [r, g, b, a]) => {
    const i = (y * S + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = a
  }
  const roundRect = (x0, y0, w, h, rad, color) => {
    for (let y = Math.floor(y0); y < y0 + h; y++)
      for (let x = Math.floor(x0); x < x0 + w; x++) {
        const dx = Math.max(x0 + rad - x, x - (x0 + w - 1 - rad), 0)
        const dy = Math.max(y0 + rad - y, y - (y0 + h - 1 - rad), 0)
        if (dx * dx + dy * dy <= rad * rad) put(x, y, color)
      }
  }
  const scale = S / 512
  const BG = [15, 20, 26, 255],
    PLATE = [163, 230, 53, 255],
    BAR = [215, 222, 231, 255]
  // 底（圆角方块）
  roundRect(0, 0, S, S, Math.round(96 * scale), BG)
  // 杠铃杆
  roundRect(
    Math.round(120 * scale),
    Math.round(245 * scale),
    Math.round(272 * scale),
    Math.round(23 * scale),
    Math.round(11 * scale),
    BAR
  )
  // 两侧杠铃片（外大内小）
  for (const side of [0, 1]) {
    const m = side ? S : 0
    roundRect(
      side ? S - Math.round(158 * scale) - Math.round(62 * scale) : Math.round(158 * scale),
      Math.round(170 * scale),
      Math.round(62 * scale),
      Math.round(173 * scale),
      Math.round(18 * scale),
      PLATE
    )
    roundRect(
      side ? S - Math.round(230 * scale) - Math.round(48 * scale) : Math.round(230 * scale),
      Math.round(203 * scale),
      Math.round(48 * scale),
      Math.round(107 * scale),
      Math.round(14 * scale),
      PLATE
    )
    void m
  }
  return Buffer.from(px)
}

const resizeNearest = (buf, sw, sh, dw, dh) => {
  const out = Buffer.alloc(dw * dh * 4)
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x / dw) * sw)),
        sy = Math.min(sh - 1, Math.floor((y / dh) * sh))
      buf.copy(out, (y * dw + x) * 4, (sy * sw + sx) * 4, (sy * sw + sx) * 4 + 4)
    }
  return out
}

const dir = path.join(process.cwd(), 'public', 'icons')
fs.mkdirSync(dir, { recursive: true })
const big = drawIcon(512)
fs.writeFileSync(path.join(dir, 'icon-512.png'), encodePNG(512, 512, big))
fs.writeFileSync(path.join(dir, 'icon-192.png'), encodePNG(192, 192, resizeNearest(big, 512, 512, 192, 192)))
fs.writeFileSync(
  path.join(dir, 'apple-touch-icon.png'),
  encodePNG(180, 180, resizeNearest(big, 512, 512, 180, 180))
)
console.log('icons written to', dir)
