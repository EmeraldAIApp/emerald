import { describe, expect, it } from 'vitest'
import { safeText } from '../util.js'

describe('safeText', () => {
  it('removes Unicode format characters (bidi overrides, zero-width, isolates) that can reorder or hide text', () => {
    const out = safeText('USDC‮ evil​‍⁦x⁩﻿')
    expect(out).not.toMatch(/[‮​‍⁦⁩﻿]/)
    expect(out).toBe('USDC evil x')
  })
  it('still strips control characters and angle brackets, and caps the length', () => {
    expect(safeText('a\u0000b\nc<d>')).toBe('a b c d')
    expect(safeText('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})
