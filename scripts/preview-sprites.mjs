/**
 * Renders every mood's frames to a single contact sheet so the animations can
 * be eyeballed without launching the app. Hand-counted character maps are easy
 * to get subtly wrong, and a miscounted row is invisible until it renders.
 *
 *   node scripts/preview-sprites.mjs [outfile.png]
 *
 * Needs the sprite module bundled first (it's TypeScript):
 *   npx esbuild src/renderer/src/cat/sprites.ts --bundle --format=esm \
 *     --define:import.meta.env.DEV=false --outfile=.tmp/sprites.mjs
 */
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { encodePng, hexToRgba } from './png.mjs'

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=')[1] : fallback
}

const SCALE = Number(arg('scale', 4))
const ONLY = arg('moods', '')
  .split(',')
  .filter(Boolean)
const CELL = 16 * SCALE
const GAP = 6
const LABEL_W = 0

const BG = [0x2b, 0x2e, 0x4f, 0xff]
const GRID = [0x34, 0x38, 0x63, 0xff]

const modulePath = resolve(process.cwd(), '.tmp/sprites.mjs')
const { MOOD_SPRITES, PALETTE, SPRITE_SIZE } = await import(pathToFileURL(modulePath).href)

const moods = Object.entries(MOOD_SPRITES).filter(
  ([mood]) => ONLY.length === 0 || ONLY.includes(mood)
)
const maxFrames = Math.max(...moods.map(([, s]) => s.frames.length))

const width = LABEL_W + maxFrames * (CELL + GAP) + GAP
const height = moods.length * (CELL + GAP) + GAP
const buf = Buffer.alloc(width * height * 4)

function put(x, y, rgba) {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const i = (y * width + x) * 4
  buf[i] = rgba[0]
  buf[i + 1] = rgba[1]
  buf[i + 2] = rgba[2]
  buf[i + 3] = rgba[3]
}

// Background
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(x, y, BG)

const problems = []

moods.forEach(([mood, spec], row) => {
  const oy = GAP + row * (CELL + GAP)

  spec.frames.forEach((frame, col) => {
    const ox = LABEL_W + GAP + col * (CELL + GAP)

    // Cell backing, so an empty frame is still visible as a cell.
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) put(ox + x, oy + y, GRID)

    if (frame.rows.length !== SPRITE_SIZE) {
      problems.push(`${mood} frame ${col}: ${frame.rows.length} rows`)
    }

    frame.rows.forEach((line, y) => {
      if (line.length !== SPRITE_SIZE) {
        problems.push(`${mood} frame ${col} row ${y}: width ${line.length} — "${line}"`)
      }
      line.split('').forEach((ch, x) => {
        if (ch === '.') return
        const hex = PALETTE[ch]
        if (!hex) {
          problems.push(`${mood} frame ${col} row ${y}: unknown char "${ch}"`)
          return
        }
        const rgba = hexToRgba(hex)
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            put(ox + x * SCALE + dx, oy + y * SCALE + dy, rgba)
          }
        }
      })
    })
  })
})

const out = process.argv[2]?.startsWith('--') ? 'sprite-preview.png' : (process.argv[2] ?? 'sprite-preview.png')
writeFileSync(out, encodePng(width, height, buf))

console.log(`rows, top to bottom: ${moods.map(([m]) => m).join(', ')}`)
console.log(`wrote ${out} (${width}x${height})`)

if (problems.length > 0) {
  console.error('\nPROBLEMS:')
  for (const p of problems) console.error('  ' + p)
  process.exitCode = 1
} else {
  console.log('all frames are 16x16 with known colours')
}
