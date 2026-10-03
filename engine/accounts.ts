import { NEW_CONTRACT_MS } from './known.js'
import { parseCode } from './sources/rpc.js'
import type { BlockscoutAddress, GoPlusAddressSecurity } from './sources/raw-types.js'
import type { Hex, MetadataTag, Sources } from './types.js'
import { lower } from './util.js'

export type AccountFailure = 'rpc' | 'blockscout' | 'goplus' | 'metadata' | 'creation'

/** Everything the engine knows about an address. null in a field = could not be read (see `failed`). */
export interface AccountFacts {
  address: Hex
  kind: 'eoa' | 'eip7702' | 'contract' | null
  delegate: Hex | null
  blockscout: {
    isScam: boolean
    reputation: string
    isContract: boolean
    isVerified: boolean
    proxyType: string | null
    name: string | null
    ens: string | null
    isToken: boolean
    tokenType: string | null
    creationTxHash: string | null
    delegateName: string | null
  } | null
  createdAt: Date | null
  goplus: GoPlusAddressSecurity | null
  tags: MetadataTag[] | null
  failed: AccountFailure[]
}

function blockscoutFacts(a: BlockscoutAddress): NonNullable<AccountFacts['blockscout']> {
  if (typeof a !== 'object' || a === null || typeof a.is_contract !== 'boolean') throw new Error('unexpected Blockscout address shape')
  return {
    isScam: a.is_scam === true,
    reputation: a.reputation,
    isContract: a.is_contract,
    isVerified: a.is_verified === true,
    proxyType: a.proxy_type ?? null,
    name: a.name ?? null,
    ens: a.ens_domain_name ?? null,
    isToken: a.token !== null && a.token !== undefined,
    tokenType: a.token?.type ?? null,
    creationTxHash: a.creation_transaction_hash ?? null,
    delegateName: a.proxy_type === 'eip7702' ? (a.implementations?.[0]?.name ?? null) : null,
  }
}

async function gatherOne(address: Hex, sources: Sources, tags: MetadataTag[] | null, metadataFailed: boolean): Promise<AccountFacts> {
  const f: AccountFacts = { address, kind: null, delegate: null, blockscout: null, createdAt: null, goplus: null, tags, failed: [] }
  if (metadataFailed) f.failed.push('metadata')
  const [code, bs, gp] = await Promise.allSettled([
    sources.rpc.getCode(address),
    sources.blockscout.getAddress(address),
    sources.goplus.addressSecurity(address),
  ])
  // A 200 with another shape counts as a failed source, never as a throw (design decision 1) nor as clean data.
  try {
    if (code.status !== 'fulfilled') throw code.reason
    const c = parseCode(code.value)
    f.kind = c.kind
    if (c.kind === 'eip7702') f.delegate = c.delegate
  } catch {
    f.failed.push('rpc')
  }
  try {
    if (bs.status !== 'fulfilled') throw bs.reason
    f.blockscout = blockscoutFacts(bs.value)
  } catch {
    f.failed.push('blockscout')
  }
  if (gp.status === 'fulfilled' && typeof gp.value === 'object' && gp.value !== null) f.goplus = gp.value
  else f.failed.push('goplus')

  const hash = f.blockscout?.creationTxHash
  if (isContractFact(f)) {
    try {
      const t = hash ? await sources.blockscout.getTransaction(hash as Hex) : null
      const at = t?.timestamp ? new Date(t.timestamp) : null
      if (at && !Number.isNaN(at.getTime())) f.createdAt = at
    } catch {
      // recorded below
    }
    // Unknown age is missing data, never "old": no creation hash, a creation tx that is missing, has no timestamp or an
    // unparsable one all count as a failed lookup, so labels fails (yellow) instead of treating the contract as >= 7 days.
    if (!f.createdAt) f.failed.push('creation')
  }
  return f
}

/** Gathers facts for several addresses in parallel. Never throws: failures end up in `failed`. */
export async function gatherAccounts(addresses: Hex[], sources: Sources): Promise<Map<Hex, AccountFacts>> {
  const list = [...new Set(addresses.map(lower))].sort()
  const out = new Map<Hex, AccountFacts>()
  if (list.length === 0) return out
  let meta: Record<string, MetadataTag[]> | null = null
  try {
    meta = await sources.blockscout.getMetadata(list)
  } catch {
    meta = null
  }
  const facts = await Promise.all(list.map((a) => gatherOne(a, sources, meta ? (meta[a] ?? []) : null, meta === null)))
  for (const f of facts) out.set(f.address, f)
  return out
}

/** A "real" contract (not an EOA delegated with 7702). */
export function isContractFact(f: AccountFacts): boolean {
  if (f.kind !== null) return f.kind === 'contract'
  return f.blockscout?.isContract === true && f.blockscout.proxyType !== 'eip7702'
}

/** Classification for the approval rules: a delegated EOA (7702) counts as an EOA. */
export function partyClass(f: AccountFacts | undefined): 'eoa' | 'unverified' | 'verified' | 'unknown' {
  if (!f) return 'unknown'
  if (f.kind === 'eoa' || f.kind === 'eip7702') return 'eoa'
  if (f.kind === null && f.blockscout && (!f.blockscout.isContract || f.blockscout.proxyType === 'eip7702')) return 'eoa'
  if (!isContractFact(f) || !f.blockscout) return 'unknown'
  return f.blockscout.isVerified ? 'verified' : 'unverified'
}

/** Contract created less than 7 days before `now`. */
export function isYoung(f: AccountFacts | undefined, now: Date): boolean {
  return !!f?.createdAt && now.getTime() - f.createdAt.getTime() < NEW_CONTRACT_MS
}
