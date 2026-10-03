import type { Hex, MetadataTag } from '../types.js'
import { requestJson, SourceError, type HttpOpts } from './http.js'
import type {
  BlockscoutAddress,
  BlockscoutMetadata,
  BlockscoutPage,
  BlockscoutToken,
  BlockscoutTokenTransfer,
  BlockscoutTransaction,
} from './raw-types.js'

const BLOCKSCOUT = 'https://eth.blockscout.com/api/v2'
const BS_METADATA = 'https://metadata.services.blockscout.com/api/v1/metadata'
/** Per request; two pages in a row still fit the engine's 25 s budget. */
const BS_TIMEOUT_MS = 6000

export async function blockscoutGetAddress(address: Hex, o: HttpOpts = {}): Promise<BlockscoutAddress> {
  const { status, json } = await requestJson('blockscout', `${BLOCKSCOUT}/addresses/${address}`, { timeoutMs: BS_TIMEOUT_MS, ...o })
  if (status !== 200) throw new SourceError('blockscout', 'http', `HTTP ${status}: ${JSON.stringify(json)}`, status)
  return json as BlockscoutAddress // unknown: 200 with coin_balance null
}

async function paged<T>(
  base: string,
  first: Record<string, string>,
  maxPages: number,
  o: HttpOpts,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = []
  let next: Record<string, string | number> | null = {}
  let pages = 0
  while (next && pages < maxPages) {
    const qs = new URLSearchParams(first)
    for (const [k, v] of Object.entries(next)) qs.set(k, String(v)) // next_page_params is forwarded as is
    const q = qs.toString()
    const { status, json } = await requestJson('blockscout', q ? `${base}?${q}` : base, { timeoutMs: BS_TIMEOUT_MS, ...o })
    if (status !== 200) throw new SourceError('blockscout', 'http', `HTTP ${status}`, status)
    const page = json as BlockscoutPage<T>
    items.push(...page.items)
    next = page.next_page_params
    pages++
  }
  return { items, truncated: next !== null }
}

export function blockscoutGetTokenTransfers(
  address: Hex,
  { maxPages = 2, ...o }: HttpOpts & { maxPages?: number } = {},
): Promise<{ items: BlockscoutTokenTransfer[]; truncated: boolean }> {
  return paged<BlockscoutTokenTransfer>(`${BLOCKSCOUT}/addresses/${address}/token-transfers`, { type: 'ERC-20' }, maxPages, o)
}

export function blockscoutGetTransactions(
  address: Hex,
  { maxPages = 2, filter, ...o }: HttpOpts & { maxPages?: number; filter?: 'from' | 'to' } = {},
): Promise<{ items: BlockscoutTransaction[]; truncated: boolean }> {
  const first: Record<string, string> = filter ? { filter } : {}
  return paged<BlockscoutTransaction>(`${BLOCKSCOUT}/addresses/${address}/transactions`, first, maxPages, o)
}

export async function blockscoutGetToken(address: Hex, o: HttpOpts = {}): Promise<BlockscoutToken | null> {
  const { status, json } = await requestJson('blockscout', `${BLOCKSCOUT}/tokens/${address}`, { timeoutMs: BS_TIMEOUT_MS, ...o })
  if (status === 404) return null
  if (status !== 200) throw new SourceError('blockscout', 'http', `HTTP ${status}`, status)
  return json as BlockscoutToken
}

export async function blockscoutGetTransaction(hash: Hex, o: HttpOpts = {}): Promise<BlockscoutTransaction | null> {
  const { status, json } = await requestJson('blockscout', `${BLOCKSCOUT}/transactions/${hash}`, { timeoutMs: BS_TIMEOUT_MS, ...o })
  if (status === 404) return null
  if (status !== 200) throw new SourceError('blockscout', 'http', `HTTP ${status}`, status)
  return json as BlockscoutTransaction
}

/** Tags ('Fake_Phishing…', 'Phish / Hack', 'Uniswap Protocol: Permit2'), keyed by lowercase address. */
export async function blockscoutGetMetadata(addresses: Hex[], o: HttpOpts = {}): Promise<Record<string, MetadataTag[]>> {
  if (addresses.length === 0) return {}
  const url = `${BS_METADATA}?addresses=${addresses.join(',')}&chainId=1`
  const { status, json } = await requestJson('blockscout', url, { timeoutMs: 5000, ...o })
  if (status !== 200) throw new SourceError('blockscout', 'http', `metadata HTTP ${status}`, status)
  const out: Record<string, MetadataTag[]> = {}
  for (const [k, v] of Object.entries((json as BlockscoutMetadata).addresses)) {
    out[k.toLowerCase()] = v.tags.map((t) => ({ slug: t.slug, name: t.name, tagType: t.tagType }))
  }
  return out
}
