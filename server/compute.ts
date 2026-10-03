import { encodeFunctionData, parseAbi } from 'viem'
import type { Hex } from '../engine/types.js'
import type { Deps } from './deps.js'
import { STATS_CHECKS, STATS_LLM_USD } from './quota.js'

export interface ComputeStats {
  llmUsd: number
  checksRun: number
  feesClaimableWei: string
  feesClaimedWei: string
  updatedAt: string
}

// FeeEscrow (Sourcify exact_match, verified 2026-09-30): mapping claimable[account][currency]; claim(currency, to).
const FEE_ESCROW_ABI = parseAbi(['function claimable(address account, address currency) view returns (uint256)'])
const CACHE_KEY = 'em:compute'
const STALE_KEY = 'em:compute:stale'
const MAX_CLAIM_TXS = 20

/** WETH the creator wallet can claim today (FeeEscrow.claimable). */
export async function readClaimable(deps: Deps, creator: Hex): Promise<bigint> {
  const data = encodeFunctionData({ abi: FEE_ESCROW_ABI, functionName: 'claimable', args: [creator, deps.env.WETH] })
  return BigInt(await deps.sources.rpc.call(deps.env.FEE_ESCROW, data))
}

/** WETH already claimed: creator txs to FeeEscrow -> WETH that left FeeEscrow in each one (Blockscout). */
export async function readClaimed(deps: Deps, creator: Hex): Promise<bigint> {
  const escrow = deps.env.FEE_ESCROW.toLowerCase()
  const weth = deps.env.WETH.toLowerCase()
  const { items } = await deps.sources.blockscout.getTransactions(creator, { filter: 'from', maxPages: 3 })
  const claims = items.filter((t) => t.to?.hash.toLowerCase() === escrow && t.result === 'success').slice(0, MAX_CLAIM_TXS)
  let total = 0n
  for (const c of claims) {
    const t = await deps.sources.blockscout.getTransaction(c.hash as Hex)
    for (const x of t?.token_transfers ?? []) {
      if (x.from.hash.toLowerCase() === escrow && x.token.address_hash.toLowerCase() === weth) total += BigInt(x.total.value ?? '0')
    }
  }
  return total
}

/** Public counter (spec §3): LLM spend, checks run, claimable and claimed fees. 60 s cache. */
export async function readCompute(deps: Deps): Promise<ComputeStats> {
  const hit = await deps.store.getJson<ComputeStats>(CACHE_KEY).catch(() => null)
  if (hit) return hit
  try {
    const creator = deps.env.CREATOR_ADDRESS
    const [llmUsd, checksRun, claimable, claimed] = await Promise.all([
      deps.store.getNumber(STATS_LLM_USD),
      deps.store.getNumber(STATS_CHECKS),
      creator ? readClaimable(deps, creator) : Promise.resolve(0n),
      creator ? readClaimed(deps, creator) : Promise.resolve(0n),
    ])
    const stats: ComputeStats = {
      llmUsd: Math.round(llmUsd * 10000) / 10000,
      checksRun,
      feesClaimableWei: claimable.toString(),
      feesClaimedWei: claimed.toString(),
      updatedAt: deps.now().toISOString(),
    }
    await deps.store.setJson(CACHE_KEY, stats, 60).catch(() => undefined)
    await deps.store.setJson(STALE_KEY, stats, 7 * 24 * 3600).catch(() => undefined)
    return stats
  } catch (e) {
    const stale = await deps.store.getJson<ComputeStats>(STALE_KEY).catch(() => null)
    if (stale) return stale
    throw e
  }
}
