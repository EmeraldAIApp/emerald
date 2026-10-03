import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runChecks } from '../index.js'
import { liveSources } from '../sources/index.js'
import { CASES_DIR, CASES_NOW, loadCase, loadRecording, replayFetch } from './helpers/recording.js'

// Real mainnet cases (spec §6): responses recorded with scripts/record-cases.ts, fixed ctx.now.
const names = readdirSync(CASES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))

describe('real mainnet cases (recorded)', () => {
  for (const name of names) {
    it(name, async () => {
      const c = loadCase(name)
      const rec = loadRecording(name)
      if (!rec) throw new Error(`missing recording: run "npx tsx scripts/record-cases.ts ${name}"`)
      const v = await runChecks(c.input, { sources: liveSources({ fetchImpl: replayFetch(rec) }), userAddress: c.userAddress, now: CASES_NOW })
      const codes = v.reasons.map((r) => r.code)
      expect({ level: v.level, failed: v.checksFailed }).toEqual({ level: c.expectedLevel, failed: [] })
      for (const code of c.expectedReasonCodes) expect(codes).toContain(code)
      if (c.expectedLevel === 'green') expect(v.reasons.filter((r) => r.severity !== 'ok')).toEqual([])
    })
  }
})
