import { describe, expect, it } from 'vitest'
import { addSpend, consume, STATS_LLM_USD, tierForBalance, usage } from '../quota.js'
import { MemoryStore } from '../redis.js'

const NOW = Date.parse('2026-09-30T20:00:00Z')

describe('consume / usage', () => {
  it('anon: 5 per UTC day per id, resets next day', async () => {
    const store = new MemoryStore(() => NOW)
    for (let i = 1; i <= 5; i++) {
      expect(await consume(store, { tier: 'anon', id: '9.9.9.9', spendCapUsd: 20, nowMs: NOW })).toMatchObject({ ok: true, used: i, limit: 5, resetAt: '2026-10-01T00:00:00.000Z' })
    }
    expect(await consume(store, { tier: 'anon', id: '9.9.9.9', spendCapUsd: 20, nowMs: NOW })).toMatchObject({ ok: false, reason: 'quota', used: 5 })
    expect(await consume(store, { tier: 'anon', id: '8.8.8.8', spendCapUsd: 20, nowMs: NOW })).toMatchObject({ ok: true, used: 1 })
    const tomorrow = NOW + 24 * 3600 * 1000
    expect(await consume(store, { tier: 'anon', id: '9.9.9.9', spendCapUsd: 20, nowMs: tomorrow })).toMatchObject({ ok: true, used: 1 })
    expect(await usage(store, { tier: 'anon', id: '9.9.9.9', nowMs: NOW })).toEqual({ tier: 'anon', limit: 5, used: 5, resetAt: '2026-10-01T00:00:00.000Z' })
  })

  it('daily spend cap pauses anon only; whale has fair use 1000 and limit null', async () => {
    const store = new MemoryStore(() => NOW)
    await addSpend(store, 12.5, NOW)
    await addSpend(store, 7.5, NOW)
    expect(await store.getNumber(STATS_LLM_USD)).toBeCloseTo(20)
    expect(await consume(store, { tier: 'anon', id: 'ip', spendCapUsd: 20, nowMs: NOW })).toMatchObject({ ok: false, reason: 'paused' })
    expect(await consume(store, { tier: 'holder', id: '0xabc', spendCapUsd: 20, nowMs: NOW })).toMatchObject({ ok: true, limit: 100 })
    expect(await consume(store, { tier: 'whale', id: '0xdef', spendCapUsd: 20, nowMs: NOW })).toMatchObject({ ok: true, limit: null })
  })

  it('tier thresholds: 100k holder, 1M whale', () => {
    expect(tierForBalance(99_999n)).toBe('anon')
    expect(tierForBalance(100_000n)).toBe('holder')
    expect(tierForBalance(1_000_000n)).toBe('whale')
  })
})
