import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LIGHT } from '../src/light/light.js'

describe('verdict light', () => {
  it('uses the same multiply/screen numbers as scripts/light-mask.py (the approved preview)', () => {
    const py = readFileSync(fileURLToPath(new URL('../../scripts/light-mask.py', import.meta.url)), 'utf8')
    const layer = (name: string) => {
      const m = new RegExp(`"${name}": \\(([0-9.]+), ([0-9.]+)\\)`).exec(py)
      if (!m) throw new Error(`LAYER.${name} is missing from light-mask.py`)
      return { mul: Number(m[1]), glow: Number(m[2]) }
    }
    expect({ mul: LIGHT.idle.mul, glow: LIGHT.idle.glow }).toEqual(layer('sky'))
    expect({ mul: LIGHT.yellow.mul, glow: LIGHT.yellow.glow }).toEqual(layer('amber'))
    expect({ mul: LIGHT.red.mul, glow: LIGHT.red.glow }).toEqual(layer('red'))
    expect({ mul: LIGHT.green.mul, glow: LIGHT.green.glow }).toEqual(layer('emerald'))
  })

  it('each level lights with its own token', () => {
    expect(LIGHT.red.c).toBe('var(--alert)')
    expect(LIGHT.yellow.c).toBe('var(--amber)')
    expect(LIGHT.green.c).toBe('var(--emerald)')
    expect(LIGHT.idle.c).toBe('var(--dv-ink)')
  })
})
