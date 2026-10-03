import { describe, expect, it } from 'vitest'
import { GEM_PALETTE, gemGrid, pixelSvg, silhouette, SPARKLE_GRID, SPARKLE_PALETTE } from '../pixel.js'
import { bayer8, DESK, encodePng, HALO, haloLevel, wallIndex, wallRgb } from '../wallpaper.js'

describe('gemGrid', () => {
  const g = gemGrid()
  it('is a 16x16 grid that only uses the gem palette', () => {
    expect(g).toHaveLength(16)
    for (const row of g) {
      expect(row).toHaveLength(16)
      for (const ch of row) if (ch !== '.') expect(GEM_PALETTE[ch]).toBeDefined()
    }
  })
  it('is an octagon: cut corners, solid middle, outlined edge', () => {
    expect(g[0]![0]).toBe('.')
    expect(g[15]![15]).toBe('.')
    expect(g[8]![0]).toBe('K')
    expect(g[0]![8]).toBe('K')
    expect(g[8]![8]).not.toBe('.')
  })
  it('is lit from the top left: light facet there, deep shade at the bottom right', () => {
    expect(g.join('')).toContain('W')
    expect(g[2]![4]).toBe('H')
    expect(g[13]![10]).toBe('D')
  })
})

describe('pixelSvg', () => {
  it('merges runs into one rect and scales by px', () => {
    const svg = pixelSvg(['.XX', 'X..'], { X: '#123456' }, 10)
    expect(svg).toContain('viewBox="0 0 3 2" width="30" height="20"')
    expect(svg).toContain('<rect x="1" y="0" width="2" height="1" fill="#123456"/>')
    expect(svg.match(/<rect/g)).toHaveLength(2)
    expect(svg).toContain('shape-rendering="crispEdges"')
  })
  it('silhouette keeps the shape in one color', () => {
    expect(silhouette(['.ab.'])).toEqual(['.XX.'])
  })
  it('the sparkle only uses its palette', () => {
    for (const ch of SPARKLE_GRID.join('')) if (ch !== '.') expect(SPARKLE_PALETTE[ch]).toBeDefined()
  })
})

describe('wallpaper', () => {
  it('bayer8 is a permutation of the 64 thresholds k/64 over one 8x8 tile', () => {
    const seen = new Set<number>()
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) seen.add(Math.round(bayer8(x, y) * 64))
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i))
  })
  it('only paints the desk palette (plus moon and stars)', () => {
    const o = { w: 60, h: 40, t: 10, stars: false }
    for (let y = 0; y < o.h; y += 3) for (let x = 0; x < o.w; x += 3) {
      const i = wallIndex(o, x, y)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThanOrEqual(5)
      expect(DESK).toContain(wallRgb(o, x, y))
    }
  })
  it('draws the crescent moon where asked', () => {
    const moon = { x: 20, y: 20, r: 10 }
    expect(DESK).not.toContain(wallRgb({ w: 40, h: 40, moon, stars: false }, 12, 24)) // lower-left of the disc: lit
    expect(DESK).toContain(wallRgb({ w: 40, h: 40, moon, stars: false }, 25, 15)) // the bite (upper right): sky
  })
  it('encodes a valid PNG', () => {
    const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 0, 0, 255]))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(2) // IHDR width
    expect(png.readUInt32BE(20)).toBe(1) // IHDR height
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow('png: expected 12 bytes, got 3')
  })
})

describe('halo', () => {
  const h = { x: 50, y: 50, r: 20, peak: 0.9 }
  it('is brightest at the center and gone far away (no stray specks)', () => {
    expect(haloLevel(h, 50, 50)).toBeGreaterThanOrEqual(2)
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) expect(haloLevel(h, x, y)).toBe(0)
  })
  it('paints only halo colors near the light', () => {
    const o = { w: 100, h: 100, stars: false, halo: h }
    for (let x = 46; x < 54; x++) {
      const c = wallRgb(o, x, 50)
      expect([...HALO, ...DESK]).toContain(c)
    }
  })
})
