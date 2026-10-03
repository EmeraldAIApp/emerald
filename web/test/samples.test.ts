import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHIPS, SAMPLES } from '../src/chat/samples.js'

const caseFile = (name: string) => fileURLToPath(new URL(`../../engine/test/fixtures/cases/${name}.json`, import.meta.url))

describe('Try a real case samples', () => {
  for (const s of Object.values(SAMPLES).filter((x) => x.caseName)) {
    it(`${s.id} is byte-identical to the real case ${s.caseName}`, () => {
      const c = JSON.parse(readFileSync(caseFile(s.caseName!), 'utf8')) as { input: string; userAddress?: string; expectedLevel: string }
      expect(s.input).toBe(c.input)
      expect(s.userAddress).toBe(c.userAddress)
      expect(c.expectedLevel).toBe(s.level)
    })
  }

  it('visible chips are known samples, at least the two the spec asks for', () => {
    for (const id of CHIPS) expect(SAMPLES[id]).toBeDefined()
    expect(CHIPS.slice(0, 2)).toEqual(['permit2-drainer', 'poisoned-address'])
    // at least one real case that ends green, so the checker is not only shown saying no
    expect(CHIPS.some((id) => SAMPLES[id].level === 'green')).toBe(true)
  })

  it('notes have no em dash', () => {
    for (const s of Object.values(SAMPLES)) expect(s.note).not.toContain('—')
  })
})
