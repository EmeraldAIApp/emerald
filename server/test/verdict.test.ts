import { describe, expect, it } from 'vitest'
import { STATS_CHECKS } from '../quota.js'
import { runVerdict } from '../verdict.js'
import { fakeDeps, RED_VERDICT } from './helpers.js'

describe('runVerdict', () => {
  it('caches the serialized verdict for 10 min and counts every real run', async () => {
    const deps = fakeDeps()
    const a = await runVerdict(deps, ' 0x00001f78189bE22C3498cFF1B8e02272C3220000 ')
    const b = await runVerdict(deps, '0x00001f78189bE22C3498cFF1B8e02272C3220000')
    expect(JSON.parse(a).level).toBe('red')
    expect(b).toBe(a)
    expect(deps.engineCalls).toBe(1)
    expect(await deps.store.getNumber(STATS_CHECKS)).toBe(1)
  })

  it('does not cache verdicts with failed checks', async () => {
    const deps = fakeDeps({ engine: async () => ({ ...RED_VERDICT, level: 'yellow', checksFailed: ['labels'] }) })
    await runVerdict(deps, '0x00001f78189bE22C3498cFF1B8e02272C3220000')
    await runVerdict(deps, '0x00001f78189bE22C3498cFF1B8e02272C3220000')
    expect(deps.engineCalls).toBe(2)
  })

  it('passes userAddress, the own token address and now to the engine', async () => {
    let seen: unknown
    const deps = fakeDeps({ env: { EMERALD_TOKEN_ADDRESS: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' }, engine: async (_i, ctx) => { seen = ctx; return RED_VERDICT } })
    await runVerdict(deps, '0x00001f78189bE22C3498cFF1B8e02272C3220000', '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f')
    expect(seen).toEqual({ userAddress: '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f', selfTokenAddress: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', now: new Date('2026-09-30T20:00:00Z') })
  })
})
