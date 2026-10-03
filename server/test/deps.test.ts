import { describe, expect, it } from 'vitest'
import { stubSources } from '../../engine/test/helpers/stub-sources.js'
import { ENGINE_BUDGET_MS, engineWithBudget } from '../deps.js'
import { makeClient } from '../llm.js'

const hang = () => new Promise<never>(() => {})

describe('time budget (Vercel maxDuration 60 s)', () => {
  it('the engine answers within its budget even when every source hangs', async () => {
    const sources = stubSources({
      rpc: { getCode: hang },
      blockscout: { getAddress: hang, getMetadata: hang },
      goplus: { addressSecurity: hang },
    })
    const t0 = Date.now()
    const v = await engineWithBudget(sources, 100)('0x28C6c06298d514Db089934071355E5743bf21d60', { now: new Date('2026-09-30T20:00:00Z') })
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(v.level).toBe('yellow')
    expect(ENGINE_BUDGET_MS).toBeLessThanOrEqual(25_000)
  })

  it('the LLM client never retries and gives up waiting for headers after 30 s', () => {
    const c = makeClient({ ANTHROPIC_API_KEY: 'sk-test' })
    expect(c.maxRetries).toBe(0)
    expect(c.timeout).toBe(30_000)
  })
})
