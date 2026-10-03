import { describe, expect, it } from 'vitest'
import type { AccountFacts } from '../accounts.js'
import { labelsCheck } from '../labels.js'
import type { GoPlusAddressSecurity } from '../sources/raw-types.js'
import type { Hex } from '../types.js'
import { raw } from './helpers/fixtures.js'

const NOW = new Date('2026-09-30T20:00:00Z')
const gp = (name: string) => raw<{ result: GoPlusAddressSecurity }>(name).result
const bs = {
  isScam: false, reputation: 'ok', isContract: false, isVerified: false, proxyType: null, name: null,
  ens: null, isToken: false, tokenType: null, creationTxHash: null, delegateName: null,
}
function facts(address: string, over: Partial<AccountFacts> = {}, bsOver: Partial<AccountFacts['blockscout'] & object> = {}): AccountFacts {
  return {
    address: address.toLowerCase() as Hex, kind: 'eoa', delegate: null, blockscout: { ...bs, ...bsOver }, createdAt: null,
    goplus: gp('goplus-address-security-clean-eoa-binance14'), tags: [], failed: [], ...over,
  }
}
const run = (...fs: AccountFacts[]) => labelsCheck({ parties: fs.map((f) => f.address), accounts: new Map(fs.map((f) => [f.address, f])), now: NOW })
const codes = (r: { reasons: { code: string; severity: string }[] }) => r.reasons.map((x) => `${x.code}:${x.severity}`)

describe('labelsCheck', () => {
  it('Inferno Drainer: GoPlus + Blockscout flags (real fixtures)', () => {
    const f = facts('0x0000db5c8B030ae20308ac975898E09741e70000', {
      goplus: gp('goplus-address-security-inferno-drainer-flagged'),
      tags: [{ slug: 'phish--hack', name: 'Phish / Hack', tagType: 'generic' }, { slug: 'inferno-drainer-approvals', name: 'Inferno Drainer: Approvals', tagType: 'name' }],
    }, { isScam: true, reputation: 'scam' })
    const r = run(f)
    expect(r.status).toBe('ok')
    expect(codes(r)).toEqual(['LABEL_FLAGGED_GOPLUS:danger', 'LABEL_FLAGGED_BLOCKSCOUT:danger'])
    expect(r.reasons[0]!.text).toContain('phishing_activities, blacklist_doubt')
    expect(r.reasons[1]!.text).toContain('Phish / Hack')
  })

  it('sanctioned address (Lazarus / Ronin) is flagged by GoPlus', () => {
    expect(codes(run(facts('0x098B716B8Aaf21512996dC57EB0615e2383E2f96', { goplus: gp('goplus-address-security-sanctioned-lazarus-ronin') })))).toContain('LABEL_FLAGGED_GOPLUS:danger')
  })

  it('EIP-7702 delegated wallet with ENS is clean (vitalik.eth fixture shape)', () => {
    const f = facts('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', { kind: 'eip7702', delegate: '0x5a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d' }, {
      isContract: true, isVerified: true, proxyType: 'eip7702', ens: 'vitalik.eth', delegateName: 'AmbireAccount7702',
    })
    expect(codes(run(f))).toEqual(['ENS_NAME:ok', 'EIP7702_DELEGATED:ok'])
  })

  it('unverified contract and contract younger than 7 days are warnings', () => {
    const unverified = facts('0x8571C129F335832F6BBC76D49414AD2B8371a422', { kind: 'contract', createdAt: new Date('2023-09-21T10:08:59Z') }, { isContract: true })
    expect(codes(run(unverified))).toEqual(['CONTRACT_UNVERIFIED:warn'])
    const young = facts('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', { kind: 'contract', createdAt: new Date('2026-09-29T18:35:11Z') }, { isContract: true, isVerified: true, name: 'LaunchToken' })
    const r = run(young)
    expect(codes(r)).toEqual(['CONTRACT_NEW:warn', 'KNOWN_NAME:ok'])
    expect(r.reasons[0]!.text).toContain('1 day(s) ago')
  })

  it('a clean EOA gets LABELS_CLEAR', () => {
    expect(codes(run(facts('0x28C6c06298d514Db089934071355E5743bf21d60')))).toEqual(['LABELS_CLEAR:ok'])
  })

  it('GoPlus or Blockscout down -> failed + SOURCE_FAILED, but found flags are kept', () => {
    const f = facts('0x0000db5c8B030ae20308ac975898E09741e70000', { goplus: null, failed: ['goplus'] }, { isScam: true, reputation: 'scam' })
    const r = run(f)
    expect(r.status).toBe('failed')
    expect(codes(r)).toEqual(['LABEL_FLAGGED_BLOCKSCOUT:danger', 'SOURCE_FAILED:warn'])
  })

  it('metadata service down -> failed + SOURCE_FAILED (tags could not be read)', () => {
    const r = run(facts('0x28C6c06298d514Db089934071355E5743bf21d60', { tags: null, failed: ['metadata'] }))
    expect(r.status).toBe('failed')
    expect(codes(r)).toEqual(['LABELS_CLEAR:ok', 'SOURCE_FAILED:warn'])
  })

  it('GoPlus mixer / gas_abuse / reinit flags are warnings, not dangers', () => {
    const risky = { ...gp('goplus-address-security-clean-eoa-binance14'), mixer: '1', gas_abuse: '1', reinit: '1' }
    const r = run(facts('0x28C6c06298d514Db089934071355E5743bf21d60', { goplus: risky }))
    expect(codes(r)).toEqual(['LABEL_RISK_GOPLUS:warn'])
    expect(r.reasons[0]!.text).toContain('mixer, gas_abuse, reinit')
  })

  it('no parties -> skipped', () => {
    expect(labelsCheck({ parties: [], accounts: new Map(), now: NOW }).status).toBe('skipped')
  })
})
