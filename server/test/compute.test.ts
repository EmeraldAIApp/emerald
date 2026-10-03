import { describe, expect, it, vi } from 'vitest'
import type { BlockscoutTransaction } from '../../engine/sources/raw-types.js'
import { readCompute } from '../compute.js'
import { makeComputeHandler } from '../handlers/compute.js'
import { addSpend, STATS_CHECKS } from '../quota.js'
import { FOREVER } from '../redis.js'
import { fakeDeps, get, NOW } from './helpers.js'

const CREATOR = '0x49071f087C949CDa8E05969999e9E6CfeaB5C279'
const ESCROW = '0xAcefe251da006887dA41C063D06CC82A060824BA'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const tx = (hash: string, to: string, result = 'success') => ({ hash, to: { hash: to }, result }) as unknown as BlockscoutTransaction
const claimTx = (value: string) =>
  ({ token_transfers: [{ from: { hash: ESCROW }, to: { hash: CREATOR }, token: { address_hash: WETH }, total: { decimals: '18', value } }] }) as unknown as BlockscoutTransaction

describe('readCompute', () => {
  it('without CREATOR_ADDRESS: fees are 0, stats come from Redis', async () => {
    const deps = fakeDeps()
    await addSpend(deps.store, 0.0112, NOW.getTime())
    await deps.store.incrExpireAt(STATS_CHECKS, FOREVER)
    expect(await readCompute(deps)).toEqual({ llmUsd: 0.0112, checksRun: 1, feesClaimableWei: '0', feesClaimedWei: '0', updatedAt: '2026-09-30T20:00:00.000Z' })
  })

  it('reads FeeEscrow.claimable(creator, WETH) and sums WETH claimed out of FeeEscrow', async () => {
    let callData = ''
    const deps = fakeDeps({
      env: { CREATOR_ADDRESS: CREATOR },
      sources: {
        rpc: { call: async (to, data) => { callData = `${to}:${data}`; return `0x${(5n * 10n ** 16n).toString(16).padStart(64, '0')}` } },
        blockscout: {
          getTransactions: async () => ({ items: [tx('0xa1', ESCROW), tx('0xa2', '0x0000000000000000000000000000000000000001'), tx('0xa3', ESCROW, 'error')], truncated: false }),
          getTransaction: async (h) => (h === '0xa1' ? claimTx('18446744073709551') : null),
        },
      },
    })
    const s = await readCompute(deps)
    expect(s.feesClaimableWei).toBe('50000000000000000')
    expect(s.feesClaimedWei).toBe('18446744073709551')
    // selector of claimable(address,address) = 0xd4570c1c (keccak verified with viem in Step 1 of this task)
    expect(callData.startsWith(`${ESCROW}:0xd4570c1c`)).toBe(true)
  })

  it('handler: 200 with cache headers; 503 when sources fail and nothing is cached', async () => {
    const ok = await makeComputeHandler(() => fakeDeps())(get('/api/compute'))
    expect(ok.status).toBe(200)
    // s-maxage so Vercel's CDN can serve it too (browsers keep max-age)
    expect(ok.headers.get('cache-control')).toBe('public, max-age=30, s-maxage=30')
    // the handler logs the failure; silence that expected line so the test output stays clean
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const down = await makeComputeHandler(() => fakeDeps({ env: { CREATOR_ADDRESS: CREATOR } }))(get('/api/compute'))
    expect(down.status).toBe(503)
    expect(logged).toHaveBeenCalledWith('[emerald] /api/compute', expect.anything())
  })
})
