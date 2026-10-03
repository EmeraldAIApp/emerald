// Pure geometry: box -> quadrilateral homography (bracelet mini-screen) and the loupe lines.
export type Pt = [number, number]
/** Corners in plate px, in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt]
export interface Rect { left: number; top: number; right: number; bottom: number }

/** CSS matrix (column-major, 16 values) that maps the w×h box with origin 0,0 onto the quadrilateral. */
export function quadMatrix(w: number, h: number, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: Quad): number[] {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / den
  const k = (dx1 * dy3 - dx3 * dy1) / den
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3
  return [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1]
}

export function toMatrix3d(m: number[]): string {
  return `matrix3d(${m.map((n) => +n.toFixed(10)).join(',')})`
}

/** Projects (x, y) with a quadMatrix matrix (the same thing the browser does). */
export function project(m: number[], x: number, y: number): Pt {
  const X = m[0]! * x + m[4]! * y + m[12]!
  const Y = m[1]! * x + m[5]! * y + m[13]!
  const W = m[3]! * x + m[7]! * y + m[15]!
  return [X / W, Y / W]
}

function hull(points: { p: Pt; tag: 'q' | 'r' }[]) {
  const pts = [...points].sort((u, v) => u.p[0] - v.p[0] || u.p[1] - v.p[1])
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: typeof pts) => {
    const out: typeof pts = []
    for (const pt of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!.p, out[out.length - 1]!.p, pt.p) <= 0) out.pop()
      out.push(pt)
    }
    out.pop()
    return out
  }
  return [...half(pts), ...half([...pts].reverse())]
}

/**
 * The two loupe hairlines: the outer tangents between the bracelet screen and the panel
 * (the convex hull edges joining one point of each). They never cross the screen or the panel.
 * Returns [screenPoint, panelPoint][]; empty if they overlap degenerately.
 */
export function loupeLines(quad: Quad, panel: Rect): [Pt, Pt][] {
  const corners: Pt[] = [[panel.left, panel.top], [panel.right, panel.top], [panel.right, panel.bottom], [panel.left, panel.bottom]]
  const h = hull([...quad.map((p) => ({ p, tag: 'q' as const })), ...corners.map((p) => ({ p, tag: 'r' as const }))])
  const out: [Pt, Pt][] = []
  for (let i = 0; i < h.length; i++) {
    const a = h[i]!
    const b = h[(i + 1) % h.length]!
    if (a.tag !== b.tag) out.push(a.tag === 'q' ? [a.p, b.p] : [b.p, a.p])
  }
  return out.length === 2 ? out : []
}
