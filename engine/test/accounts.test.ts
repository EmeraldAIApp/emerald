import { describe, expect, it } from 'vitest'
import { gatherAccounts, isYoung, partyClass, type AccountFacts } from '../accounts.js'
import type { BlockscoutAddress, BlockscoutTransaction, GoPlusAddressSecurity } from '../sources/raw-types.js'
import type { Hex, MetadataTag } from '../types.js'
import { raw } from './helpers/fixtures.js'
import { stubSources } from './helpers/stub-sources.js'

const DRAINER = '0x0000db5c8b030ae20308ac975898e09741e70000'
const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const UNVERIFIED = '0x8571c129f335832f6bbc76d49414ad2b8371a422'

const CODE: Record<string, string> = {
  [DRAINER]: '0x',
  [VITALIK]: '0xef01005a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d',
  [UNVERIFIED]: '0x6080604052',
}
const BS: Record<string, string> = {
  [DRAINER]: 'blockscout-address-scam-inferno-drainer',
  [VITALIK]: 'blockscout-address-eip7702-delegated-vitalik',
  [UNVERIFIED]: 'blockscout-address-unverified-contract',
}

function sources(overrides: { goplusDown?: boolean; metadataDown?: boolean } = {}) {
  return stubSources({
    rpc: { getCode: async (a) => CODE[a.toLowerCase()] ?? '0x' },
    blockscout: {
      getAddress: async (a) => raw<BlockscoutAddress>(BS[a.toLowerCase()]!),
      getTransaction: async () => raw<BlockscoutTransaction>('blockscout-transaction-creation-of-unverified-contract'),
      getMetadata: overrides.metadataDown
        ? undefined
        : async () => ({ [DRAINER]: [{ slug: 'scam', name: 'SCAM', tagType: 'generic' }] as MetadataTag[] }),
    },
    goplus: {
      addressSecurity: overrides.goplusDown
        ? undefined
        : async (a) =>
            raw<{ result: GoPlusAddressSecurity }>(
              a.toLowerCase() === DRAINER ? 'goplus-address-security-inferno-drainer-flagged' : 'goplus-address-security-clean-eoa-binance14',
            ).result,
    },
  })
}

describe('gatherAccounts', () => {
  it('collects code kind, Blockscout, GoPlus and tags per address (lowercased keys)', async () => {
    const m = await gatherAccounts([DRAINER.toUpperCase().replace('0X', '0x') as Hex, VITALIK, UNVERIFIED], sources())
    const d = m.get(DRAINER)!
    expect(d.kind).toBe('eoa')
    expect(d.blockscout?.isScam).toBe(true)
    expect(d.goplus?.phishing_activities).toBe('1')
    expect(d.tags?.[0]?.slug).toBe('scam')
    expect(d.failed).toEqual([])

    const v = m.get(VITALIK)!
    expect(v.kind).toBe('eip7702')
    expect(v.delegate).toBe('0x5a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d')
    expect(v.blockscout?.ens).toBe('vitalik.eth')
    expect(v.blockscout?.delegateName).toBe('AmbireAccount7702')
    expect(v.createdAt).toBeNull()

    const u = m.get(UNVERIFIED)!
    expect(u.kind).toBe('contract')
    expect(u.createdAt?.toISOString()).toBe('2023-09-21T10:08:59.000Z')
  })

  it('records failures instead of throwing', async () => {
    const m = await gatherAccounts([DRAINER], sources({ goplusDown: true, metadataDown: true }))
    expect(m.get(DRAINER)!.failed.sort()).toEqual(['goplus', 'metadata'])
    expect(m.get(DRAINER)!.tags).toBeNull()
  })
})

describe('gatherAccounts: unexpected source shapes', () => {
  it('a 200 with another shape (null body, non-string code, null GoPlus result) is a failure, never a throw', async () => {
    const s = stubSources({
      rpc: { getCode: async () => 123 as unknown as string },
      blockscout: { getAddress: async () => null as unknown as BlockscoutAddress, getMetadata: async () => ({}) },
      goplus: { addressSecurity: async () => null as unknown as GoPlusAddressSecurity },
    })
    const f = (await gatherAccounts([DRAINER], s)).get(DRAINER)!
    expect(f.blockscout).toBeNull()
    expect(f.goplus).toBeNull()
    expect(f.failed.sort()).toEqual(['blockscout', 'goplus', 'rpc'])
  })
})

describe('gatherAccounts: contract age', () => {
  const ROUTER = '0x66a9893cc07d91d95644aedd05d03f95e1dba8af'
  const routerSources = (creationHash: string | null, tx: () => Promise<BlockscoutTransaction | null>) =>
    stubSources({
      rpc: { getCode: async () => '0x6080604052' },
      blockscout: {
        getAddress: async () => ({ ...raw<BlockscoutAddress>('blockscout-address-verified-universal-router'), creation_transaction_hash: creationHash }),
        getTransaction: tx,
        getMetadata: async () => ({}),
      },
      goplus: { addressSecurity: async () => raw<{ result: GoPlusAddressSecurity }>('goplus-address-security-clean-eoa-binance14').result },
    })
  const created = raw<BlockscoutTransaction>('blockscout-transaction-creation-of-unverified-contract')

  it('a contract whose age cannot be read records a creation failure (unknown age is missing data, never "old")', async () => {
    const cases: [string | null, () => Promise<BlockscoutTransaction | null>][] = [
      [null, async () => created], // no creation hash
      ['0xabc', async () => null], // creation tx not found
      ['0xabc', async () => ({ ...created, timestamp: null }) as unknown as BlockscoutTransaction], // no timestamp
      ['0xabc', async () => ({ ...created, timestamp: 'not a date' })], // unparsable timestamp
    ]
    for (const [hash, tx] of cases) {
      const f = (await gatherAccounts([ROUTER], routerSources(hash, tx))).get(ROUTER)!
      expect(f.createdAt).toBeNull()
      expect(f.failed).toContain('creation')
    }
  })

  it('a readable creation date is not a failure', async () => {
    const f = (await gatherAccounts([ROUTER], routerSources('0xabc', async () => created))).get(ROUTER)!
    expect(f.createdAt?.toISOString()).toBe('2023-09-21T10:08:59.000Z')
    expect(f.failed).toEqual([])
  })
})

describe('partyClass / isYoung', () => {
  const base: AccountFacts = { address: DRAINER, kind: 'eoa', delegate: null, blockscout: null, createdAt: null, goplus: null, tags: null, failed: [] }
  const bs = { isScam: false, reputation: 'ok', isContract: true, isVerified: true, proxyType: null, name: null, ens: null, isToken: false, tokenType: null, creationTxHash: null, delegateName: null }
  it('EIP-7702 delegated EOA counts as an EOA', () => {
    expect(partyClass({ ...base, kind: 'eip7702', blockscout: { ...bs, proxyType: 'eip7702' } })).toBe('eoa')
  })
  it('contract needs Blockscout to know if it is verified', () => {
    expect(partyClass({ ...base, kind: 'contract', blockscout: bs })).toBe('verified')
    expect(partyClass({ ...base, kind: 'contract', blockscout: { ...bs, isVerified: false } })).toBe('unverified')
    expect(partyClass({ ...base, kind: 'contract', blockscout: null })).toBe('unknown')
    expect(partyClass(undefined)).toBe('unknown')
  })
  it('falls back to Blockscout when getCode failed', () => {
    expect(partyClass({ ...base, kind: null, blockscout: { ...bs, isContract: false } })).toBe('eoa')
  })
  it('young = created less than 7 days before now', () => {
    const now = new Date('2026-09-30T20:00:00Z')
    expect(isYoung({ ...base, createdAt: new Date('2026-09-29T18:35:11Z') }, now)).toBe(true)
    expect(isYoung({ ...base, createdAt: new Date('2026-09-17T21:46:11Z') }, now)).toBe(false)
    expect(isYoung({ ...base, createdAt: null }, now)).toBe(false)
  })
})
