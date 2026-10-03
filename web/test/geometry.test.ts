import { describe, expect, it } from 'vitest'
import { loupeLines, project, quadMatrix, toMatrix3d, type Quad } from '../src/light/geometry.js'

describe('quadMatrix', () => {
  const cases: Quad[] = [
    [[463, 1012], [672, 1008], [670, 1131], [466, 1134]],
    [[100, 100], [500, 60], [520, 300], [90, 280]],
  ]
  for (const quad of cases) {
    it(`maps the 400x236 box corners onto ${JSON.stringify(quad[0])}...`, () => {
      const m = quadMatrix(400, 236, quad)
      const got = [project(m, 0, 0), project(m, 400, 0), project(m, 400, 236), project(m, 0, 236)]
      got.forEach((p, i) => {
        expect(p[0]).toBeCloseTo(quad[i]![0], 3)
        expect(p[1]).toBeCloseTo(quad[i]![1], 3)
      })
    })
  }

  it('prints a CSS matrix3d with 16 numbers', () => {
    const s = toMatrix3d(quadMatrix(400, 236, cases[0]!))
    expect(s.startsWith('matrix3d(')).toBe(true)
    expect(s.slice(9, -1).split(',').length).toBe(16)
  })
})

describe('loupeLines', () => {
  const screen: Quad = [[440, 995], [695, 990], [695, 1150], [445, 1155]]

  it('panel to the right (hero desktop): two outer tangents from the screen to the panel left side', () => {
    const lines = loupeLines(screen, { left: 1460, top: 320, right: 2580, bottom: 1200 })
    expect(lines).toHaveLength(2)
    for (const [, panelPt] of lines) expect(panelPt[0]).toBe(1460)
    expect(lines.map(([, p]) => p[1]).sort((a, b) => a - b)).toEqual([320, 1200])
  })

  it('panel above (hero mobile): tangents land on the panel bottom corners', () => {
    const lines = loupeLines([[400, 2000], [900, 2000], [900, 2250], [400, 2250]], { left: 100, top: 900, right: 1200, bottom: 1800 })
    expect(lines).toHaveLength(2)
    expect(lines.map(([, p]) => p[1])).toEqual([1800, 1800])
    expect(lines.map(([, p]) => p[0]).sort((a, b) => a - b)).toEqual([100, 1200])
  })

  it('overlapping shapes give no lines', () => {
    expect(loupeLines(screen, { left: 0, top: 0, right: 2000, bottom: 2000 })).toEqual([])
  })
})
