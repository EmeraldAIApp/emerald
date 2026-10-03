// Contract GET reads: /api/quota and /api/compute. They return null on any unexpected shape.
import { ethFromWei, usd } from './chat/format.js'
import { isComputeInfo, isQuotaInfo, type ComputeInfo, type QuotaInfo } from './chat/wire.js'

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  try {
    const r = await fetchImpl(url, { credentials: 'same-origin', headers: { accept: 'application/json' } })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

export async function fetchQuota(fetchImpl: typeof fetch = fetch): Promise<QuotaInfo | null> {
  const j = await getJson('/api/quota', fetchImpl)
  return isQuotaInfo(j) ? j : null
}

export async function fetchCompute(fetchImpl: typeof fetch = fetch): Promise<ComputeInfo | null> {
  const j = await getJson('/api/compute', fetchImpl)
  return isComputeInfo(j) ? j : null
}

/** " (10,760 ZC)" after the claimable ETH when the fees accrue in another token; empty for WETH. */
function quoteNote(c: ComputeInfo): string {
  const sym = c.quoteSymbol?.trim()
  if (!sym || sym === 'ETH' || c.feesClaimableQuote === undefined) return ''
  let units = 0n
  try {
    units = BigInt(c.feesClaimableQuote) / 10n ** 18n
  } catch {
    return ''
  }
  return ` (${units.toLocaleString('en-US')} ${sym})`
}

/** What the S4 counter shows ("Spent on checks · 0.000 ETH", "Checks run · 0"). */
export function computeView(c: ComputeInfo): { paid: string; claimable: string; quote: string; spend: string; checks: string } {
  return {
    paid: ethFromWei(c.feesClaimedWei),
    claimable: ethFromWei(c.feesClaimableWei),
    quote: quoteNote(c),
    spend: usd(c.llmUsd),
    checks: Math.max(0, Math.floor(c.checksRun)).toLocaleString('en-US'),
  }
}
