/**
 * Generates the tray + app icons from a readable 16x16 pixel map.
 *
 * Hand-writing the PNG keeps the art reviewable in source control (you can see
 * the cat in the ASCII below) and avoids committing an opaque binary.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'resources')
const extDir = join(here, '..', 'extension', 'icons')

// '#' = fur, '.' = transparent
const CAT = [
  '................',
  '..##........##..',
  '..###......###..',
  '..####....####..',
  '..############..',
  '.##############.',
  '.##############.',
  '.###.######.###.',
  '.##############.',
  '.##############.',
  '.####.####.####.',
  '..############..',
  '..############..',
  '...##########...',
  '.....######.....',
  '................'
]

const CREAM = [0xed, 0xe7, 0xd6, 0xff]
const NAVY = [0x2b, 0x2e, 0x4f, 0xff]
const CLEAR = [0, 0, 0, 0]

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function render(scale, fur, background) {
  const size = 16 * scale
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = CAT[Math.floor(y / scale)][Math.floor(x / scale)] === '#'
      const px = on ? fur : background
      const i = (y * size + x) * 4
      buf[i] = px[0]
      buf[i + 1] = px[1]
      buf[i + 2] = px[2]
      buf[i + 3] = px[3]
    }
  }
  return encodePng(size, size, buf)
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'tray.png'), render(2, CREAM, CLEAR))
writeFileSync(join(outDir, 'tray@2x.png'), render(4, CREAM, CLEAR))
writeFileSync(join(outDir, 'icon.png'), render(16, CREAM, NAVY))
console.log('wrote tray.png, tray@2x.png, icon.png to resources/')

// Chrome wants the toolbar icon at several sizes; the cream-on-navy version
// stays legible against both light and dark browser themes.
mkdirSync(extDir, { recursive: true })
for (const scale of [1, 2, 3, 8]) {
  writeFileSync(join(extDir, `icon${scale * 16}.png`), render(scale, CREAM, NAVY))
}
console.log('wrote icon16/32/48/128.png to extension/icons/')
