import { describe, expect, it } from 'vitest'
import {
  blockscoutGetAddress,
  blockscoutGetMetadata,
  blockscoutGetToken,
  blockscoutGetTokenTransfers,
  blockscoutGetTransaction,
  blockscoutGetTransactions,
} from '../sources/blockscout.js'
import { parseCode, rpcCall, rpcGetCode, rpcGetTransactionByHash, rpcSimulate } from '../sources/rpc.js'
import { byUrl, fixed } from './helpers/fixtures.js'

const BINANCE14 = '0x28C6c06298d514Db089934071355E5743bf21d60'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
const VICTIM = '0x1E227979f0b5BC691a70DEAED2e0F39a6F538FD5'
const DRAINER = '0x0000db5c8B030ae20308ac975898E09741e70000'
const POISONER = '0xd9A1C3788D81257612E2581A6ea0aDa244853a91'

describe('blockscout', () => {
  it('address: scam flags', async () => {
    const a = await blockscoutGetAddress(POISONER, { fetchImpl: byUrl() })
    expect(a.is_scam).toBe(true)
    expect(a.reputation).toBe('scam')
  })
  it('address: 422 on a malformed hash is an http SourceError', async () => {
    await expect(blockscoutGetAddress('0xnothex', { fetchImpl: byUrl() })).rejects.toMatchObject({ kind: 'http', status: 422 })
  })
  it('token-transfers: follows next_page_params and re-adds type=ERC-20', async () => {
    const calls: string[] = []
    const r = await blockscoutGetTokenTransfers(VICTIM, { fetchImpl: byUrl(calls), maxPages: 2 })
    expect(r.items).toHaveLength(100)
    expect(r.truncated).toBe(true)
    expect(calls[1]).toBe(`https://eth.blockscout.com/api/v2/addresses/${VICTIM}/token-transfers?type=ERC-20&index=231&block_number=19782393`)
  })
  it('transactions?filter=from: first page', async () => {
    const r = await blockscoutGetTransactions(VICTIM, { fetchImpl: byUrl(), maxPages: 1, filter: 'from' })
    expect(r.items).toHaveLength(50)
    expect(r.truncated).toBe(true)
  })
  it('token: type and 404 -> null', async () => {
    expect((await blockscoutGetToken(USDC, { fetchImpl: byUrl() }))?.type).toBe('ERC-20')
    expect(await blockscoutGetToken(BINANCE14, { fetchImpl: byUrl() })).toBeNull()
  })
  it('transaction: 404 -> null', async () => {
    const h = '0x00000000000000000000000000000000000000000000000000000000deadbeef'
    expect(await blockscoutGetTransaction(h, { fetchImpl: byUrl() })).toBeNull()
  })
  it('metadata: keys lowercased, tags reduced to slug/name/tagType', async () => {
    const m = await blockscoutGetMetadata([DRAINER, POISONER], { fetchImpl: byUrl() })
    expect(m[DRAINER.toLowerCase()]?.map((t) => t.slug)).toContain('phish--hack')
    expect(m[POISONER.toLowerCase()]?.map((t) => t.name)).toContain('Fake_Phishing327990')
  })
})

describe('rpc', () => {
  it('getCode + parseCode: EOA, EIP-7702 and contract', async () => {
    expect(parseCode(await rpcGetCode(BINANCE14, { fetchImpl: fixed('rpc-getCode-eoa-binance14') }))).toEqual({ kind: 'eoa' })
    expect(parseCode(await rpcGetCode(BINANCE14, { fetchImpl: fixed('rpc-getCode-eip7702-delegated-vitalik') }))).toEqual({
      kind: 'eip7702',
      delegate: '0x5a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d',
    })
    expect(parseCode(await rpcGetCode(PERMIT2, { fetchImpl: fixed('rpc-getCode-contract-permit2') }))).toEqual({ kind: 'contract' })
  })
  it('JSON-RPC errors (HTTP 200) become kind "rpc"', async () => {
    await expect(rpcGetCode('0xnothex', { fetchImpl: fixed('rpc-error-invalid-params') })).rejects.toMatchObject({ kind: 'rpc' })
  })
  it('getTransactionByHash and eth_call', async () => {
    const tx = await rpcGetTransactionByHash('0x3374abc5a9c766ba709651399b6e6162de97ca986abc23f423a9d893c8f5f570', {
      fetchImpl: fixed('rpc-getTransactionByHash-wbtc-poisoning-theft'),
    })
    expect(tx?.from).toBe('0x1e227979f0b5bc691a70deaed2e0f39a6f538fd5')
    const out = await rpcCall(USDC, '0x70a08231', { fetchImpl: fixed('rpc-call-usdc-balanceOf-binance14') })
    expect(out.startsWith('0x')).toBe(true)
  })
  it('simulate: sends traceTransfers + stateOverrides, returns the call result', async () => {
    let body: unknown
    const f = async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return fixed('rpc-simulateV1-with-stateOverrides-balance')(_url, init)
    }
    const call = { from: '0x00000000000000000000000000000000DeaDBeef', to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', data: '0xd0e30db0', value: 10n ** 18n } as const
    const r = await rpcSimulate(call, { fetchImpl: f, balanceOverride: 100n * 10n ** 18n })
    expect(r.status).toBe('0x1')
    expect(body).toMatchObject({
      method: 'eth_simulateV1',
      params: [{ traceTransfers: true, validation: false, blockStateCalls: [{ stateOverrides: { [call.from]: { balance: '0x56bc75e2d63100000' } } }] }, 'latest'],
    })
  })
  it('simulate: top-level insufficient funds error is kind "rpc"', async () => {
    const call = { from: '0x00000000000000000000000000000000DeaDBeef', to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', data: '0xd0e30db0', value: 10n ** 18n } as const
    await expect(rpcSimulate(call, { fetchImpl: fixed('rpc-simulateV1-insufficient-eth-no-override') })).rejects.toMatchObject({ kind: 'rpc' })
  })
})
