import { describe, expect, it } from 'vitest'
import { BAND, blendTones, DEFAULT_TONE, TONES } from '../src/fx/tones.js'
import { LIGHT } from '../src/light/light.js'

describe('atmosphere tones', () => {
  it('every page section with a photo has a tone', () => {
    for (const id of ['try', 'lineup', 'book', 'how', 'token', 'roadmap']) expect(TONES[id], id).toBeDefined()
  })

  it('a single section gives its own tone, nothing visible gives the hero', () => {
    const one = blendTones([{ id: 'roadmap', w: 0.4 }])
    expect(one.dawn).toBeCloseTo(TONES.roadmap!.dawn)
    one.lit.forEach((v, i) => expect(v).toBeCloseTo(TONES.roadmap!.lit[i]!))
    expect(blendTones([])).toEqual(DEFAULT_TONE)
    expect(blendTones([{ id: 'nope', w: 1 }])).toEqual(DEFAULT_TONE)
  })

  it('blends by weight, so the dawn rises continuously into the roadmap', () => {
    const half = blendTones([{ id: 'token', w: 1 }, { id: 'roadmap', w: 1 }])
    expect(half.dawn).toBeCloseTo((TONES.token!.dawn + TONES.roadmap!.dawn) / 2)
    expect(half.lit[0]).toBeCloseTo((TONES.token!.lit[0] + TONES.roadmap!.lit[0]) / 2)
  })

  it('has one bracelet color per light level', () => {
    expect(Object.keys(BAND).sort()).toEqual(Object.keys(LIGHT).sort())
  })
})
