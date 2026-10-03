import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url))

describe('fixtures committed with the repo', () => {
  it('69 raw responses, one per manifest entry', () => {
    const manifest = JSON.parse(readFileSync(dir('./fixtures/raw/_manifest.json'), 'utf8')) as Record<string, { status: number; url: string }>
    const files = readdirSync(dir('./fixtures/raw/')).filter((f) => f.endsWith('.json') && f !== '_manifest.json')
    expect(Object.keys(manifest)).toHaveLength(69)
    expect(files.map((f) => f.slice(0, -5)).sort()).toEqual(Object.keys(manifest).sort())
  })

  it('15 real mainnet cases with the agreed keys', () => {
    const files = readdirSync(dir('./fixtures/cases/')).filter((f) => f.endsWith('.json'))
    // ops/publish.py leaves one private-only case (and its recording) out of the public mirror: 15 here, 14 there.
    expect([14, 15]).toContain(files.length)
    for (const f of files) {
      const c = JSON.parse(readFileSync(dir(`./fixtures/cases/${f}`), 'utf8')) as Record<string, unknown>
      expect(Object.keys(c).filter((k) => k !== 'userAddress').sort()).toEqual(['expectedLevel', 'expectedReasonCodes', 'input', 'name', 'sources', 'why'])
      expect(['green', 'yellow', 'red']).toContain(c.expectedLevel)
    }
  })
})
