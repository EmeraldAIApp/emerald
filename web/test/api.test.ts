import { describe, expect, it } from 'vitest'
import { computeView, fetchCompute, fetchQuota } from '../src/api.js'

const fake = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('GET /api/quota and /api/compute', () => {
  it('accepts the contract shapes', async () => {
    const q = { tier: 'anon', limit: 5, used: 1, resetAt: '2026-10-01T00:00:00.000Z' }
    expect(await fetchQuota(fake(q))).toEqual(q)
    const c = { llmUsd: 0.5, checksRun: 12345, feesClaimableWei: '0', feesClaimedWei: '1500000000000000000', updatedAt: '2026-09-30T20:00:00Z' }
    expect(await fetchCompute(fake(c))).toEqual(c)
  })

  it('returns null on wrong shapes, HTTP errors and network failures', async () => {
    expect(await fetchQuota(fake({ tier: 'vip', limit: 5, used: 1, resetAt: 'x' }))).toBeNull()
    expect(await fetchQuota(fake({ error: 'x' }, 500))).toBeNull()
    expect(await fetchCompute((async () => { throw new TypeError('offline') }) as unknown as typeof fetch)).toBeNull()
  })

  it('computeView formats the S4 counter', () => {
    expect(computeView({ llmUsd: 0.0112, checksRun: 12345, feesClaimableWei: '250000000000000000', feesClaimedWei: '1500000000000000000', updatedAt: '' }))
      .toEqual({ paid: '1.500', claimable: '0.250', quote: '', spend: '$0.01', checks: '12,345' })
    expect(computeView({ llmUsd: 0, checksRun: 0, feesClaimableWei: '0', feesClaimedWei: '0', updatedAt: '' }))
      .toEqual({ paid: '0.000', claimable: '0.000', quote: '', spend: '$0.00', checks: '0' })
    // fees in $ZC: the ETH value stays the headline, the ZC amount goes next to it
    expect(
      computeView({
        llmUsd: 0,
        checksRun: 0,
        feesClaimableWei: '102800000000000000',
        feesClaimedWei: '0',
        feesClaimableQuote: '10759889555980033000000',
        feesClaimedQuote: '0',
        quoteSymbol: 'ZC',
        updatedAt: '',
      }).quote,
    ).toBe(' (10,759 ZC)')
  })
})
