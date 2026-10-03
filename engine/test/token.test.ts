import { describe, expect, it } from 'vitest'
import type { AccountFacts } from '../accounts.js'
import type { SimulationOutcome } from '../simulate.js'
import type { GoPlusTokenSecurity } from '../sources/raw-types.js'
import { evaluateToken, gatherTokens, tokenCheck, tokenTargets } from '../token.js'
import type { Hex } from '../types.js'
import { raw } from './helpers/fixtures.js'
import { stubSources } from './helpers/stub-sources.js'

const tok = (name: string) => {
  const r = raw<{ result: Record<string, GoPlusTokenSecurity> }>(name).result
  return Object.values(r)[0] ?? null
}
const codes = (rs: { code: string; severity: string }[]) => rs.map((x) => `${x.code}:${x.severity}`)
const T = '0x7362de96703ab797156f3b1e3716323a358d7c76' as Hex

describe('evaluateToken (real GoPlus fixtures)', () => {
  it('USDC (trust list) is ok even without cannot_sell_all', () => {
    expect(codes(evaluateToken(T, tok('goplus-token-security-usdc-trustlist')))).toEqual(['TOKEN_OK:ok'])
  })
  it('fake DAI: impersonation + unknown sellability', () => {
    expect(codes(evaluateToken(T, tok('goplus-token-security-fake-dai')))).toEqual(['TOKEN_FAKE:danger', 'TOKEN_SELLABILITY_UNKNOWN:warn'])
  })
  it('NTDA: creator deployed honeypots + unknown sellability', () => {
    expect(codes(evaluateToken(T, tok('goplus-token-security-ntda-honeypot-same-creator-unverified')))).toEqual([
      'TOKEN_CREATOR_HONEYPOTS:warn',
      'TOKEN_SELLABILITY_UNKNOWN:warn',
    ])
  })
  it('9.58% sell tax is a warning', () => {
    expect(codes(evaluateToken(T, tok('goplus-token-security-sell-tax-9pct')))).toEqual(['TOKEN_SELL_TAX:warn', 'TOKEN_SELLABILITY_UNKNOWN:warn'])
  })
  it('is_honeypot = 1 is TOKEN_CANNOT_SELL danger; null data is TOKEN_UNKNOWN', () => {
    expect(codes(evaluateToken(T, { is_honeypot: '1', sell_tax: '0' }))).toEqual(['TOKEN_CANNOT_SELL:danger'])
    expect(codes(evaluateToken(T, null))).toEqual(['TOKEN_UNKNOWN:warn'])
  })
  it('unexpected shapes never throw and never read as ok: fake_token without an address, a non-numeric sell tax', () => {
    const fake = evaluateToken(T, { is_honeypot: '0', fake_token: { value: 1 } } as unknown as GoPlusTokenSecurity)
    expect(codes(fake)).toEqual(['TOKEN_FAKE:danger'])
    expect(fake[0]!.text).toContain('another token')
    expect(codes(evaluateToken(T, { is_honeypot: '0', sell_tax: 'abc' }))).toEqual(['TOKEN_SELLABILITY_UNKNOWN:warn'])
  })
  it('PEPE is ok', () => {
    expect(codes(evaluateToken(T, tok('goplus-token-security-pepe-full-fields')))).toEqual(['TOKEN_OK:ok'])
  })
})

describe('tokenTargets / tokenCheck', () => {
  const bs = { isScam: false, reputation: 'ok', isContract: true, isVerified: true, proxyType: null, name: null, ens: null, isToken: true, tokenType: 'ERC-20', creationTxHash: null, delegateName: null }
  const facts: AccountFacts = { address: T, kind: 'contract', delegate: null, blockscout: bs, createdAt: null, goplus: null, tags: [], failed: [] }
  const none: SimulationOutcome = { applicable: false, noSender: false }

  it('address input: only ERC-20 tokens are checked', () => {
    expect(tokenTargets({ kind: 'address', address: T }, none, new Map([[T, facts]]), null)).toEqual([T])
    const nft = { ...facts, blockscout: { ...bs, tokenType: 'ERC-721' } }
    expect(tokenTargets({ kind: 'address', address: T }, none, new Map([[T, nft]]), null)).toEqual([])
  })
  it('tx input: ERC-20 tokens the user receives', () => {
    const user = '0x28c6c06298d514db089934071355e5743bf21d60' as Hex
    const sim: SimulationOutcome = {
      applicable: true, error: null,
      facts: { source: 'simulated', status: 'success', revertReason: null, sender: user, movements: [
        { kind: 'transfer', asset: T, standard: 'erc20', from: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', to: user, amount: 5n },
      ] },
    }
    expect(tokenTargets({ kind: 'tx', tx: { from: user, to: T, data: '0x', value: 0n }, executed: null }, sim, new Map(), user)).toEqual([T])
  })
  it('no targets -> skipped; GoPlus down -> failed', async () => {
    expect(tokenCheck([], new Map()).status).toBe('skipped')
    const r = tokenCheck([T], await gatherTokens([T], stubSources()))
    expect(r.status).toBe('failed')
    expect(codes(r.reasons)).toEqual(['SOURCE_FAILED:warn'])
  })
})
