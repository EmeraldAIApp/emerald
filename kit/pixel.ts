// Pixel art for the X kit: the Emerald.exe gem (the desktop icon), drawn on a grid so it stays crisp at any size.

/** Gem colors (web/src/exe: --gem #3ce68c, outline #0f5a33, facet #8ff5bd). */
export const GEM_PALETTE: Record<string, string> = {
  K: '#0f5a33', // outline
  H: '#c2fcdc', // crown facet facing the light (top left)
  T: '#8ff5bd', // crown facet, top
  G: '#3ce68c', // crown facet, side
  S: '#1f9d5a', // crown facet in shade (right, bottom-left)
  D: '#11713f', // crown facet in deep shade (bottom, bottom-right)
  L: '#62eda4', // table (the flat top)
  W: '#ffffff', // highlight
}

/**
 * An emerald-cut gem on an n x n grid ('.' = transparent): an octagon outline, a ring of crown facets lit from the
 * top left, and a flat table with a hook of light (the site icon's "M18 16h8l4 4").
 */
export function gemGrid(n = 16): string[] {
  const c = Math.round(n * 0.31) // corner cut
  const m = n - 1
  const ring = Math.max(2, Math.round(n * 0.19)) // crown facet width
  const rows: string[] = []
  for (let y = 0; y < n; y++) {
    let row = ''
    for (let x = 0; x < n; x++) {
      // distance (in pixels) to each of the 8 edges; the nearest one says which facet the pixel is on
      // (diagonals first, so a tie goes to the corner facet)
      const sides = { tl: x + y - c, tr: m - x + y - c, bl: x + m - y - c, br: 2 * m - x - y - c, top: y, bottom: m - y, left: x, right: m - x }
      const d = Math.min(...Object.values(sides))
      let ch = '.'
      if (d >= 0) ch = 'K'
      if (d >= 1) {
        const face = (Object.keys(sides) as (keyof typeof sides)[]).find((k) => sides[k] === d)!
        ch = { tl: 'H', top: 'T', tr: 'G', left: 'G', right: 'S', bl: 'S', bottom: 'D', br: 'D' }[face]
      }
      if (d > ring) ch = 'L'
      row += ch
    }
    rows.push(row)
  }
  // the highlight on the table: a bar along its top edge, then a step down to the right
  const y0 = ring + 2
  const x0 = ring + 2
  const put = (x: number, y: number) => {
    const r = rows[y]
    if (r && r[x] === 'L') rows[y] = r.slice(0, x) + 'W' + r.slice(x + 1)
  }
  for (let x = x0; x < x0 + Math.round(n * 0.25); x++) put(x, y0)
  put(x0 + Math.round(n * 0.25), y0 + 1)
  put(x0, y0 + 1)
  return rows
}

/** The 4-point sparkle of the site's hero, as pixels. */
export const SPARKLE_GRID = [
  '....K....',
  '...KTK...',
  '...KTK...',
  '.KKTWTKK.',
  'KTTWWWTTK',
  '.KKTWTKK.',
  '...KTK...',
  '...KTK...',
  '....K....',
]
export const SPARKLE_PALETTE: Record<string, string> = { K: '#1f6b55', T: '#7ff5c9', W: '#ffffff' }

/** A pixel grid as an SVG with one rect per horizontal run (crispEdges), `px` CSS px per cell. */
export function pixelSvg(grid: string[], palette: Record<string, string>, px: number, cls = ''): string {
  const h = grid.length
  const w = Math.max(...grid.map((r) => r.length))
  const rects: string[] = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]!
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      const fill = palette[ch]
      if (fill) rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`)
      x = end
    }
  })
  const c = cls ? ` class="${cls}"` : ''
  return `<svg${c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}

/** Same grid, flat in one color (for the hard drop shadow behind the gem). */
export function silhouette(grid: string[]): string[] {
  return grid.map((r) => r.replace(/[^.]/g, 'X'))
}
