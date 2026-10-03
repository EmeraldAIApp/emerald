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

/** What the S4 counter shows ("Spent on checks · 0.000 ETH", "Checks run · 0"). */
export function computeView(c: ComputeInfo): { paid: string; claimable: string; spend: string; checks: string } {
  return {
    paid: ethFromWei(c.feesClaimedWei),
    claimable: ethFromWei(c.feesClaimableWei),
    spend: usd(c.llmUsd),
    checks: Math.max(0, Math.floor(c.checksRun)).toLocaleString('en-US'),
  }
}
