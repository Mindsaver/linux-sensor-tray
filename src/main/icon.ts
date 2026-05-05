import { app, nativeImage } from 'electron'
import { deflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Build a 32-bit CRC table for PNG chunks. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

/**
 * Build a small RGBA PNG buffer from a pixel-callback.
 * Used for the programmatic fallback icon only.
 */
export function buildPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number]
): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(6, 9) // color type RGBA
  ihdr.writeUInt8(0, 10)
  ihdr.writeUInt8(0, 11)
  ihdr.writeUInt8(0, 12)

  const raw = Buffer.alloc(height * (1 + width * 4))
  let off = 0
  for (let y = 0; y < height; y++) {
    raw.writeUInt8(0, off++) // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y)
      raw.writeUInt8(r & 0xff, off++)
      raw.writeUInt8(g & 0xff, off++)
      raw.writeUInt8(b & 0xff, off++)
      raw.writeUInt8(a & 0xff, off++)
    }
  }
  const idat = deflateSync(raw)

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Packaged app: `extraResources` copies `build/icon.png` here. */
function resolveRasterIconPath(): string | null {
  try {
    if (app.isPackaged && process.resourcesPath) {
      const p = join(process.resourcesPath, 'icon.png')
      if (existsSync(p)) return p
    }
  } catch {
    // ignore
  }
  const devPath = join(process.cwd(), 'build', 'icon.png')
  if (existsSync(devPath)) return devPath
  return null
}

/**
 * Window / tray icon as PNG bytes at `size`×`size`.
 * Uses `build/icon.png` (bundled via electron-builder `extraResources`) when present,
 * otherwise falls back to the built-in teal “M” glyph.
 */
export function generateAppIcon(size = 64): Buffer {
  const path = resolveRasterIconPath()
  if (path) {
    const img = nativeImage.createFromPath(path)
    if (!img.isEmpty()) {
      return img.resize({ width: size, height: size, quality: 'best' }).toPNG()
    }
  }
  return generateFallbackAppIcon(size)
}

/**
 * Programmatic fallback: rounded teal square with a stylized white “M”.
 */
function generateFallbackAppIcon(size = 64): Buffer {
  const radius = Math.round(size * 0.22)
  const inside = (x: number, y: number): boolean => {
    const minX = radius
    const maxX = size - 1 - radius
    const minY = radius
    const maxY = size - 1 - radius
    if (x >= minX && x <= maxX) return true
    if (y >= minY && y <= maxY) return true
    const cx = x < minX ? minX : x > maxX ? maxX : x
    const cy = y < minY ? minY : y > maxY ? maxY : y
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy <= radius * radius
  }

  const strokeW = Math.max(2, Math.round(size * 0.09))
  const padX = Math.round(size * 0.2)
  const padY = Math.round(size * 0.22)
  const top = padY
  const bot = size - padY
  const left = padX
  const right = size - 1 - padX
  const mid = (left + right) >> 1
  const inLine = (x: number, y: number, x1: number, y1: number, x2: number, y2: number): boolean => {
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return false
    let t = ((x - x1) * dx + (y - y1) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const px = x1 + t * dx - x
    const py = y1 + t * dy - y
    return px * px + py * py <= (strokeW / 2) * (strokeW / 2)
  }

  return buildPng(size, size, (x, y) => {
    if (!inside(x, y)) return [0, 0, 0, 0]
    const onM =
      inLine(x, y, left, bot, left, top) ||
      inLine(x, y, left, top, mid, bot * 0.6) ||
      inLine(x, y, mid, bot * 0.6, right, top) ||
      inLine(x, y, right, top, right, bot)
    if (onM) return [240, 245, 250, 255]
    const t = y / size
    const r = Math.round(20 + 10 * t)
    const g = Math.round(150 + 30 * (1 - t))
    const b = Math.round(170 + 40 * (1 - t))
    return [r, g, b, 255]
  })
}
