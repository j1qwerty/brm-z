/**
 * Generates the desktop/installer icons from the single source of truth:
 * `public/favicon.svg` (also the web favicon).
 *
 * electron-builder cannot read SVG for Windows/macOS, so we rasterise once and
 * commit the results:
 *   build/icon.png          512px  — Linux / generic builder fallback
 *   build/tray.png           32px  — system tray (small sizes blur badly)
 *   build/icon.ico                    — Windows installer + exe icon
 *
 * Run with `pnpm icons`. Requires `sharp` (devDependency).
 */
import sharp from 'sharp'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'public', 'favicon.svg')
const out = join(root, 'build')

mkdirSync(out, { recursive: true })

const svg = readFileSync(src)
const raster = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()

// Windows .ico: 16/24/32/48/64/128/256 in one container.
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoImages = await Promise.all(icoSizes.map((s) => raster(s)))

const png512 = await raster(512)
const tray32 = await raster(32)

await sharp(png512).toFile(join(out, 'icon.png'))
await sharp(tray32).toFile(join(out, 'tray.png'))

/**
 * Minimal ICO writer: a 6-byte header + one 16-byte directory entry per image,
 * then the PNG payloads (Vista+ accepts PNG-compressed entries).
 */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const entries = []
  let offset = 6 + images.length * 16
  images.forEach((img, i) => {
    const e = Buffer.alloc(16)
    const size = img.length >= 65536 ? 0 : icoSizes[i]
    e.writeUInt8(size === 256 ? 0 : size, 0) // width (0 == 256)
    e.writeUInt8(size === 256 ? 0 : size, 1) // height
    e.writeUInt8(0, 2) // palette size
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // colour planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(img.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += img.length
    entries.push(e)
  })

  return Buffer.concat([header, ...entries, ...images])
}

const { writeFileSync } = await import('node:fs')
writeFileSync(join(out, 'icon.ico'), buildIco(icoImages))

console.log(`[icons] wrote icon.png (512), tray.png (32), icon.ico (${icoSizes.join('/')}) to build/`)