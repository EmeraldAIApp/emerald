import { describe, expect, it } from 'vitest'
import { SourceError } from '../../engine/sources/http.js'
import type { GoPlusAddressSecurity } from '../../engine/sources/raw-types.js'
import { stubSources } from '../../engine/test/helpers/stub-sources.js'
import { cachedSources } from '../cache.js'
import { MemoryStore } from '../redis.js'

describe('cachedSources', () => {
  it('GoPlus answers are cached; failures are not (the next call goes to the source again)', async () => {
    let calls = 0
    const clean = { phishing_activities: '0' } as GoPlusAddressSecurity
    const s = cachedSources(stubSources({ goplus: { addressSecurity: async () => { calls++; return clean } } }), new MemoryStore())
    await s.goplus.addressSecurity('0x28C6c06298d514Db089934071355E5743bf21d60')
    await s.goplus.addressSecurity('0x28c6c06298d514db089934071355e5743bf21d60')
    expect(calls).toBe(1)
    let attempts = 0
    const flaky = cachedSources(
      stubSources({
        goplus: {
          addressSecurity: async () => {
            attempts++
            if (attempts === 1) throw new SourceError('goplus', 'timeout', 'slow') // a 4029 has its own negative cache (below)
            return clean
          },
        },
      }),
      new MemoryStore(),
    )
    await expect(flaky.goplus.addressSecurity('0x28C6c06298d514Db089934071355E5743bf21d60')).rejects.toMatchObject({ source: 'goplus', kind: 'timeout' })
    expect(await flaky.goplus.addressSecurity('0x28C6c06298d514Db089934071355E5743bf21d60')).toEqual(clean)
    expect(attempts).toBe(2)
  })

  it('after a GoPlus 4029 every GoPlus call fails fast for 60 s instead of hitting the limit again', async () => {
    let now = Date.parse('2026-09-30T20:00:00Z')
    let calls = 0
    let limited = true
    const clean = { phishing_activities: '0' } as GoPlusAddressSecurity
    const s = cachedSources(
      stubSources({
        goplus: {
          addressSecurity: async () => {
            calls++
            if (limited) throw new SourceError('goplus', 'rate_limited', 'code 4029')
            return clean
          },
          tokenSecurity: async () => {
            calls++
            return null
          },
        },
      }),
      new MemoryStore(() => now),
    )
    await expect(s.goplus.addressSecurity('0x28C6c06298d514Db089934071355E5743bf21d60')).rejects.toMatchObject({ kind: 'rate_limited' })
    expect(calls).toBe(1)
    // another address and the token endpoint: no request to GoPlus while the mark lasts
    await expect(s.goplus.addressSecurity('0x0000db5c8b030ae20308ac975898e09741e70000')).rejects.toMatchObject({ source: 'goplus', kind: 'rate_limited' })
    await expect(s.goplus.tokenSecurity('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).rejects.toMatchObject({ source: 'goplus', kind: 'rate_limited' })
    expect(calls).toBe(1)
    now += 61_000
    limited = false
    expect(await s.goplus.addressSecurity('0x0000db5c8b030ae20308ac975898e09741e70000')).toEqual(clean)
    expect(calls).toBe(2)
  })

  it('a null answer (e.g. Sourcify 404) is cached too', async () => {
    let calls = 0
    const s = cachedSources(stubSources({ sourcify: { getContract: async () => { calls++; return null } } }), new MemoryStore())
    expect(await s.sourcify.getContract('0x28C6c06298d514Db089934071355E5743bf21d60')).toBeNull()
    expect(await s.sourcify.getContract('0x28C6c06298d514Db089934071355E5743bf21d60')).toBeNull()
    expect(calls).toBe(1)
  })
})
