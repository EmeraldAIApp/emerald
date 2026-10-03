import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runChecks, serializeVerdict } from '../index.js'
import type { BlockscoutAddress, BlockscoutTransaction, GoPlusAddressSecurity, GoPlusTokenSecurity } from '../sources/raw-types.js'
import { raw } from './helpers/fixtures.js'
import { stubSources } from './helpers/stub-sources.js'

const NOW = new Date('2026-09-30T20:00:00Z')
const CASES = fileURLToPath(new URL('./fixtures/cases/', import.meta.url))
const caseOf = (name: string) => JSON.parse(readFileSync(CASES + name + '.json', 'utf8')) as { input: string; userAddress?: `0x${string}` }
const empty = { items: [], truncated: false }

describe('runChecks (orchestration with stubbed sources)', () => {
  it('unrecognized input -> yellow, every check skipped', async () => {
    const v = await runChecks('hello there', { sources: stubSources(), now: NOW })
    expect(v.level).toBe('yellow')
    expect(v.reasons.map((r) => r.code)).toEqual(['INPUT_UNRECOGNIZED'])
    expect(v.checksOk).toEqual([])
    expect(v.checksFailed).toEqual([])
    expect(v).toMatchObject({ chainId: 1, engineVersion: '1.0.0', input: { kind: 'unknown' } })
  })

  it('Permit2 batch to a flagged EOA -> red "Don\'t sign." with the three expected codes', async () => {
    const c = caseOf('permit2-batch-inferno-drainer')
    const sources = stubSources({
      rpc: { getCode: async () => '0x' },
      blockscout: {
        getAddress: async () => raw<BlockscoutAddress>('blockscout-address-scam-inferno-drainer'),
        getMetadata: async () => ({}),
        getTransactions: async () => empty,
        getTokenTransfers: async () => empty,
      },
      goplus: { addressSecurity: async () => raw<{ result: GoPlusAddressSecurity }>('goplus-address-security-inferno-drainer-flagged').result },
    })
    const v = await runChecks(c.input, { sources, userAddress: c.userAddress, now: NOW })
    expect(v.level).toBe('red')
    expect(v.headline).toBe("Don't sign.")
    const codes = v.reasons.map((r) => r.code)
    for (const code of ['PERMIT2_UNKNOWN_SPENDER', 'LABEL_FLAGGED_GOPLUS', 'LABEL_FLAGGED_BLOCKSCOUT']) expect(codes).toContain(code)
    expect(v.checksFailed).toEqual([])
    expect(v.checksOk).toEqual(['decode', 'poisoning', 'labels'])
  })

  it('every source down -> never green; failed checks are listed', async () => {
    const v = await runChecks('0x28C6c06298d514Db089934071355E5743bf21d60', { sources: stubSources(), now: NOW })
    expect(v.level).toBe('yellow')
    expect(v.checksFailed).toEqual(['labels'])
    expect(v.reasons.some((r) => r.code === 'SOURCE_FAILED')).toBe(true)
  })

  it('tx hash: resolves through Blockscout and uses the executed transfers', async () => {
    const theft = raw<BlockscoutTransaction>('blockscout-transaction-wbtc-poisoning-theft')
    const sources = stubSources({
      rpc: { getCode: async () => '0x' },
      blockscout: {
        getTransaction: async () => theft,
        getToken: async () => null,
        getAddress: async () => raw<BlockscoutAddress>('blockscout-address-scam-poisoner-wbtc'),
        getMetadata: async () => ({}),
        getTransactions: async () => empty,
        getTokenTransfers: async () => empty,
      },
      goplus: { addressSecurity: async () => raw<{ result: GoPlusAddressSecurity }>('goplus-address-security-wbtc-poisoner').result },
    })
    const v = await runChecks(theft.hash, { sources, userAddress: '0x1E227979f0b5BC691a70DEAed2e0F39a6F538FD5', now: NOW })
    expect(v.level).toBe('red')
    expect(v.reasons.find((r) => r.code === 'SIM_SEND')?.text).toContain('115528802767 raw units')
  })

  it('pasting your own address: labels still run and an explicit reason says so (never green with zero checks)', async () => {
    const BINANCE14 = '0x28C6c06298d514Db089934071355E5743bf21d60'
    const sources = stubSources({
      rpc: { getCode: async () => '0x' },
      blockscout: { getAddress: async () => raw<BlockscoutAddress>('blockscout-address-eoa-binance14'), getMetadata: async () => ({}) },
      goplus: { addressSecurity: async () => raw<{ result: GoPlusAddressSecurity }>('goplus-address-security-clean-eoa-binance14').result },
    })
    const v = await runChecks(BINANCE14, { sources, userAddress: BINANCE14.toLowerCase() as `0x${string}`, now: NOW })
    expect(v.reasons.length).toBeGreaterThanOrEqual(1)
    expect(v.reasons.map((r) => r.code)).toContain('OWN_ADDRESS')
    expect(v.checksOk).toContain('labels')
  })

  it('a limited Permit to a verified contract of unknown age is never green (the age lookup counts as failed)', async () => {
    const SPENDER = '0x1111111111111111111111111111111111111111'
    const td = {
      types: { EIP712Domain: [{ name: 'name', type: 'string' }], Permit: [{ name: 'spender', type: 'address' }] },
      primaryType: 'Permit',
      domain: { name: 'USD Coin', version: '2', chainId: 1, verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      message: { owner: '0x28C6c06298d514Db089934071355E5743bf21d60', spender: SPENDER, value: '1000000', nonce: '0', deadline: '1900000000' },
    }
    const sources = stubSources({
      rpc: { getCode: async () => '0x6080604052' },
      blockscout: {
        getAddress: async () => ({ ...raw<BlockscoutAddress>('blockscout-address-verified-universal-router'), hash: SPENDER, name: null, creation_transaction_hash: null }),
        getMetadata: async () => ({}),
      },
      goplus: { addressSecurity: async () => raw<{ result: GoPlusAddressSecurity }>('goplus-address-security-clean-eoa-binance14').result },
    })
    const v = await runChecks(JSON.stringify(td), { sources, now: NOW })
    expect(v.level).not.toBe('green')
    expect(v.checksFailed).toContain('labels')
  })

  it('a source answer with an unexpected shape fails that check (yellow) instead of throwing the whole verdict', async () => {
    const TOKEN = '0x7362de96703ab797156f3b1e3716323a358d7c76'
    const sources = stubSources({
      rpc: { getCode: async () => '0x6080604052' },
      blockscout: {
        getAddress: async () => ({ ...raw<BlockscoutAddress>('blockscout-address-verified-proxy-usdc'), hash: TOKEN }),
        getTransaction: async () => raw<BlockscoutTransaction>('blockscout-transaction-creation-of-unverified-contract'),
        getMetadata: async () => ({}),
      },
      goplus: {
        addressSecurity: async () => raw<{ result: GoPlusAddressSecurity }>('goplus-address-security-clean-eoa-binance14').result,
        // token_symbol as a number: the token rules would throw on it
        tokenSecurity: async () => ({ token_symbol: 123, is_honeypot: '0' }) as unknown as GoPlusTokenSecurity,
      },
    })
    const v = await runChecks(TOKEN, { sources, now: NOW })
    expect(v.level).toBe('yellow')
    expect(v.checksFailed).toContain('token')
    expect(v.reasons.some((r) => r.check === 'token' && r.code === 'SOURCE_FAILED')).toBe(true)
  })

  it('serializeVerdict turns bigint into string and is a single line', async () => {
    const v = await runChecks(caseOf('poisoning-wbtc-68m-legit-counterparty').input, { sources: stubSources(), now: NOW })
    const s = serializeVerdict(v)
    expect(s).not.toContain('\n')
    expect(JSON.parse(s).input.tx.value).toBe('50000000000000000')
  })
})
