// The Emerald.exe desktop wallpaper, painted on the CPU for the X kit: a port of the plasma + Bayer 8x8 ordered dither
// of web/src/exe/wallpaper.ts (FRAG_WALL), frozen at one instant, plus a tiny PNG encoder (no dependencies).
import { crc32, deflateSync } from 'node:zlib'

type Rgb = readonly [number, number, number]

/** The desk palette, deep indigo -> lavender (same six stops as the site shader). */
export const DESK: readonly Rgb[] = [
  [62, 65, 184],
  [85, 94, 217],
  [102, 126, 234],
  [125, 143, 240],
  [154, 166, 245],
  [195, 200, 251],
]
const MOON_DARK: Rgb = [204, 199, 245]
const MOON_LIT: Rgb = [244, 242, 255]
const WHITE: Rgb = [255, 255, 255]

const fract = (x: number) => x - Math.floor(x)

/** Bayer threshold in [0, 1), identical to the shader's bayer8 (integer pixel coordinates). */
export function bayer8(x: number, y: number): number {
  const b2 = (ax: number, ay: number) => {
    ax = Math.floor(ax)
    ay = Math.floor(ay)
    return fract(ax * 0.5 + ay * ay * 0.75)
  }
  const b4 = (ax: number, ay: number) => b2(0.5 * ax, 0.5 * ay) * 0.25 + b2(ax, ay)
  return b4(0.5 * x, 0.5 * y) * 0.25 + b2(x, y)
}

const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)

export interface Circle {
  x: number // wallpaper px, from the left
  y: number // wallpaper px, from the top
  r: number
}

export interface WallOpts {
  w: number // wallpaper px (= CSS px / cell)
  h: number
  t?: number // shader time, seconds
  moon?: Circle
  glow?: Circle // a soft light (the ETH diamond's, or behind the PFP gem)
  lift?: number // overall brightness offset
  stars?: boolean
  halo?: Circle & { peak?: number } // an emerald light, dithered into the desk (banner gems); peak in [0, 1]
}

/** Emerald halo ramp, from the violet desk towards the gem (dithered against the desk, never blended). */
export const HALO: readonly Rgb[] = [
  [76, 150, 214],
  [62, 196, 170],
  [92, 226, 160],
]

/** Halo level of one pixel: 0 = desk, 1..3 = HALO[level - 1]. Ordered dither, so the edge stays pixel-crisp. */
export function haloLevel(h: Circle & { peak?: number }, x: number, yDown: number): number {
  const d = Math.hypot(x - h.x, yDown - h.y) / h.r
  const v = Math.min((h.peak ?? 0.72) * Math.exp(-d * d * 2.2), 0.999)
  if (v < 0.06) return 0 // no stray specks far from the light
  const q = v * 3
  return Math.floor(q) + (bayer8(x, yDown) < q - Math.floor(q) ? 1 : 0)
}

/** Palette index (0..5) of one wallpaper pixel; y goes down here, the shader's goes up. */
export function wallIndex(o: WallOpts, x: number, yDown: number): number {
  const y = o.h - 1 - yDown
  const t = (o.t ?? 40) * 0.07
  const th = bayer8(x, y)
  const ux = x / o.h
  const uy = y / o.h
  let px = ux * 1.7
  let py = uy * 1.7
  const wx = Math.sin(py * 1.3 + t * 3.1) + Math.sin(py * 0.7 - t * 1.7)
  const wy = Math.cos(px * 1.1 - t * 2.3) + Math.cos(px * 0.6 + t * 1.3)
  px += wx * 0.38
  py += wy * 0.38
  const f = Math.sin(px * 1.8 + t * 2.0) + Math.sin(py * 2.2 - t * 1.6) + Math.sin((px + py) * 1.3 + t * 1.1)
  let v = 0.37 + f * 0.105 + (o.lift ?? 0)
  v -= (y / o.h) * 0.12
  v += ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) * 0.022
  if (o.glow) {
    const dx = (x - o.glow.x) / o.glow.r
    const dy = (yDown - o.glow.y) / o.glow.r
    v += 0.16 * Math.exp(-(dx * dx + dy * dy) * 1.6)
  }
  if (o.moon) {
    const md = Math.hypot(x - o.moon.x, yDown - o.moon.y)
    v += 0.14 * Math.exp(-Math.max(md - o.moon.r, 0) / (o.moon.r * 0.9))
  }
  v = Math.min(Math.max(v, 0), 0.999)
  const q = v * 5
  return Math.floor(q) + (th <= fract(q) ? 1 : 0)
}

export function wallRgb(o: WallOpts, x: number, yDown: number): Rgb {
  if (o.moon) {
    const mx = x - o.moon.x
    const my = yDown - o.moon.y
    const md = Math.hypot(mx, my)
    // crescent: the disc minus a disc shifted up-right
    if (md <= o.moon.r && Math.hypot(mx - 0.44 * o.moon.r, my + 0.32 * o.moon.r) >= o.moon.r * 0.8) {
      const n = md > 0 ? (-mx * 0.7071 + my * 0.7071) / md : 0 // lit from the lower left
      return bayer8(x, yDown) < 0.55 + 0.27 * n ? MOON_LIT : MOON_DARK
    }
  }
  if (o.stars ?? true) {
    const gx = Math.floor(x / 15)
    const gy = Math.floor(yDown / 15)
    const h = hash(gx, gy)
    if (h > 0.952) {
      const sx = gx * 15 + 2 + Math.floor(hash(gx + 3.1, gy + 3.1) * 11)
      const sy = gy * 15 + 2 + Math.floor(hash(gx + 7.7, gy + 7.7) * 11)
      const d = Math.abs(x - sx) + Math.abs(yDown - sy)
      if (d === 0 || (d === 1 && h > 0.985)) return WHITE
    }
  }
  if (o.halo) {
    const lv = haloLevel(o.halo, x, yDown)
    if (lv > 0) return HALO[lv - 1]!
  }
  return DESK[wallIndex(o, x, yDown)]!
}

/** RGB PNG (8-bit, no alpha). */
export function encodePng(w: number, h: number, rgb: Uint8Array): Buffer {
  if (rgb.length !== w * h * 3) throw new Error(`png: expected ${w * h * 3} bytes, got ${rgb.length}`)
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0 // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1)
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** The wallpaper as a PNG data URI, one PNG pixel per wallpaper pixel (the page upscales it with hard pixels). */
export function wallpaperUri(o: WallOpts): string {
  const rgb = new Uint8Array(o.w * o.h * 3)
  for (let y = 0; y < o.h; y++)
    for (let x = 0; x < o.w; x++) {
      const c = wallRgb(o, x, y)
      rgb.set(c, (y * o.w + x) * 3)
    }
  return `data:image/png;base64,${encodePng(o.w, o.h, rgb).toString('base64')}`
}
