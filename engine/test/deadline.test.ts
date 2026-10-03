import { describe, expect, it } from 'vitest'
import { runChecks } from '../index.js'
import { withDeadline } from '../sources/deadline.js'
import { SourceError } from '../sources/http.js'
import { stubSources } from './helpers/stub-sources.js'

const NOW = new Date('2026-09-30T20:00:00Z')
const hang = () => new Promise<never>(() => {})

describe('withDeadline', () => {
  it('a hung source becomes a timeout SourceError when the budget runs out', async () => {
    const s = withDeadline(stubSources({ goplus: { addressSecurity: hang } }), Date.now() + 30)
    const err = await s.goplus.addressSecurity('0x28c6c06298d514db089934071355e5743bf21d60').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SourceError)
    expect(err).toMatchObject({ source: 'goplus', kind: 'timeout' })
  })

  it('after the deadline a source is not even called', async () => {
    let calls = 0
    const s = withDeadline(stubSources({ rpc: { getCode: async () => (calls++, '0x') } }), Date.now() - 1)
    await expect(s.rpc.getCode('0x28c6c06298d514db089934071355e5743bf21d60')).rejects.toMatchObject({ source: 'rpc', kind: 'timeout' })
    expect(calls).toBe(0)
  })

  it('answers that arrive in time pass through unchanged', async () => {
    const s = withDeadline(stubSources({ rpc: { getCode: async () => '0x6080' } }), Date.now() + 1000)
    expect(await s.rpc.getCode('0x28c6c06298d514db089934071355e5743bf21d60')).toBe('0x6080')
  })

  it('runChecks with every source hung still answers (yellow, failed checks) within the budget', async () => {
    const sources = stubSources({
      rpc: { getCode: hang, simulate: hang, getTransactionByHash: hang, call: hang },
      blockscout: { getAddress: hang, getMetadata: hang, getTransactions: hang, getTokenTransfers: hang, getToken: hang, getTransaction: hang },
      goplus: { addressSecurity: hang, tokenSecurity: hang },
      sourcify: { getContract: hang, resolvedAbi: hang },
      openchain: { lookupFunctions: hang },
    })
    const t0 = Date.now()
    const v = await runChecks('0x28C6c06298d514Db089934071355E5743bf21d60', { sources: withDeadline(sources, Date.now() + 100), now: NOW })
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(v.level).toBe('yellow')
    expect(v.checksFailed).toEqual(['labels'])
  })
})
