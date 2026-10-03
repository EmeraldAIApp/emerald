import { describe, expect, it } from 'vitest'
import { goplusAddressSecurity, goplusTokenSecurity } from '../sources/goplus.js'
import { openchainLookupFunctions } from '../sources/openchain.js'
import { sourcifyGetContract, sourcifyResolvedAbi } from '../sources/sourcify.js'
import { byUrl, fixed } from './helpers/fixtures.js'

const BINANCE14 = '0x28C6c06298d514Db089934071355E5743bf21d60'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
const DRAINER = '0x0000db5c8B030ae20308ac975898E09741e70000'

describe('sourcify', () => {
  it('404 means not verified (EOA or unverified contract)', async () => {
    expect(await sourcifyGetContract(BINANCE14, { fetchImpl: byUrl() })).toBeNull()
  })
  it('follows proxyResolution to the implementation ABI (USDC -> FiatTokenV2_2)', async () => {
    const r = await sourcifyResolvedAbi(USDC, { fetchImpl: byUrl() })
    expect(r?.implementation).toBe('0x43506849D7C04F9138D1A2050bbF3A0c054402dd')
    expect(r?.abi.some((i) => i.type === 'function' && i.name === 'approve')).toBe(true)
  })
  it('non-proxy returns its own ABI', async () => {
    const r = await sourcifyResolvedAbi(PERMIT2, { fetchImpl: byUrl() })
    expect(r?.implementation).toBeNull()
    expect(r?.abi.length).toBe(31)
  })
})

describe('openchain', () => {
  it('returns candidates keyed by lowercase selector, null when unknown', async () => {
    const r = await openchainLookupFunctions(['0x3593564c', '0xa9059cbb', '0x9f8e7d6c'], { fetchImpl: byUrl() })
    expect(r['0xa9059cbb']?.[0]?.name).toBe('transfer(address,uint256)')
    expect(r['0x9f8e7d6c']).toBeNull()
  })
  it('ok=false becomes a bad_response SourceError', async () => {
    await expect(openchainLookupFunctions(['0x00000000'], { fetchImpl: fixed('openchain-lookup-error-invalid-hash') })).rejects.toMatchObject({
      source: 'openchain',
      kind: 'bad_response',
    })
  })
})

describe('goplus', () => {
  it('address_security flags are strings', async () => {
    const r = await goplusAddressSecurity(DRAINER, { fetchImpl: byUrl() })
    expect(r.phishing_activities).toBe('1')
    expect(r.blacklist_doubt).toBe('1')
  })
  it('code 4029 (HTTP 200) is rate_limited', async () => {
    await expect(goplusAddressSecurity(DRAINER, { fetchImpl: fixed('goplus-error-4029-rate-limited') })).rejects.toMatchObject({
      source: 'goplus',
      kind: 'rate_limited',
    })
  })
  it('token_security: lowercase key, null when not a token', async () => {
    expect((await goplusTokenSecurity(USDC, { fetchImpl: byUrl() }))?.trust_list).toBe('1')
    expect(await goplusTokenSecurity(BINANCE14, { fetchImpl: byUrl() })).toBeNull()
  })
})
