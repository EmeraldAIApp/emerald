import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbi } from 'viem'
import type { Hex } from '../engine/types.js'
import type { Deps } from './deps.js'
import { STATS_CHECKS, STATS_LLM_USD } from './quota.js'

export interface ComputeStats {
  llmUsd: number
  checksRun: number
  /** Fees valued in ETH (wei). When the quote token is not WETH, at the current pool price. */
  feesClaimableWei: string
  feesClaimedWei: string
  /** The same fees in the quote token's own units (18 decimals), and its symbol. */
  feesClaimableQuote: string
  feesClaimedQuote: string
  quoteSymbol: string
  updatedAt: string
}

// FeeEscrow (Sourcify exact_match, verified 2026-09-30): mapping claimable[account][currency]; claim(currency, to).
const FEE_ESCROW_ABI = parseAbi(['function claimable(address account, address currency) view returns (uint256)'])
// Uniswap v4 PoolManager (mainnet): pool state lives at keccak256(poolId, 6); slot0's low 160 bits are sqrtPriceX96.
export const POOL_MANAGER = '0x000000000004444c5dc75cB358380D2e3dE08A90'
const EXTSLOAD_ABI = parseAbi(['function extsload(bytes32 slot) view returns (bytes32)'])
const POOLS_SLOT = 6n
const ONE = 10n ** 18n
const CACHE_KEY = 'em:compute'
const STALE_KEY = 'em:compute:stale'
const MAX_CLAIM_TXS = 20

/** Quote-token fees the creator wallet can claim today (FeeEscrow.claimable). */
export async function readClaimable(deps: Deps, creator: Hex): Promise<bigint> {
  const data = encodeFunctionData({ abi: FEE_ESCROW_ABI, functionName: 'claimable', args: [creator, deps.env.QUOTE_TOKEN] })
  return BigInt(await deps.sources.rpc.call(deps.env.FEE_ESCROW, data))
}

/** Quote-token fees already claimed: creator txs to FeeEscrow -> quote token that left FeeEscrow in each (Blockscout). */
export async function readClaimed(deps: Deps, creator: Hex): Promise<bigint> {
  const escrow = deps.env.FEE_ESCROW.toLowerCase()
  const quote = deps.env.QUOTE_TOKEN.toLowerCase()
  const { items } = await deps.sources.blockscout.getTransactions(creator, { filter: 'from', maxPages: 3 })
  const claims = items.filter((t) => t.to?.hash.toLowerCase() === escrow && t.result === 'success').slice(0, MAX_CLAIM_TXS)
  let total = 0n
  for (const c of claims) {
    const t = await deps.sources.blockscout.getTransaction(c.hash as Hex)
    for (const x of t?.token_transfers ?? []) {
      if (x.from.hash.toLowerCase() === escrow && x.token.address_hash.toLowerCase() === quote) total += BigInt(x.total.value ?? '0')
    }
  }
  return total
}

/** Wei of ETH per 1e18 units of the quote token, read from the quote/WETH pool on Stockereum's hook (1e18 for WETH). */
export async function readQuotePriceWei(deps: Deps): Promise<bigint> {
  const { QUOTE_TOKEN: quote, WETH: weth, STOCKEREUM_HOOK: hook } = deps.env
  if (quote.toLowerCase() === weth.toLowerCase()) return ONE
  const quoteIs0 = BigInt(quote) < BigInt(weth)
  const [c0, c1] = quoteIs0 ? [quote, weth] : [weth, quote]
  const poolId = keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [c0, c1, 0, 200, hook]),
  )
  const slot = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [poolId, POOLS_SLOT]))
  const word = BigInt(await deps.sources.rpc.call(POOL_MANAGER, encodeFunctionData({ abi: EXTSLOAD_ABI, functionName: 'extsload', args: [slot] })))
  const sqrtP = word & ((1n << 160n) - 1n)
  if (sqrtP === 0n) throw new Error(`no ${deps.env.QUOTE_SYMBOL}/WETH pool on the Stockereum hook`)
  // price of currency0 in currency1 = (sqrtP / 2^96)^2; both tokens have 18 decimals
  return quoteIs0 ? (sqrtP * sqrtP * ONE) >> 192n : (ONE << 192n) / (sqrtP * sqrtP)
}

/** Public counter (spec §3): LLM spend, checks run, claimable and claimed fees. 60 s cache. */
export async function readCompute(deps: Deps): Promise<ComputeStats> {
  const hit = await deps.store.getJson<ComputeStats>(CACHE_KEY).catch(() => null)
  if (hit) return hit
  try {
    const creator = deps.env.CREATOR_ADDRESS
    const [llmUsd, checksRun, claimable, claimed, price] = await Promise.all([
      deps.store.getNumber(STATS_LLM_USD),
      deps.store.getNumber(STATS_CHECKS),
      creator ? readClaimable(deps, creator) : Promise.resolve(0n),
      creator ? readClaimed(deps, creator) : Promise.resolve(0n),
      creator ? readQuotePriceWei(deps) : Promise.resolve(ONE),
    ])
    const stats: ComputeStats = {
      llmUsd: Math.round(llmUsd * 10000) / 10000,
      checksRun,
      feesClaimableWei: ((claimable * price) / ONE).toString(),
      feesClaimedWei: ((claimed * price) / ONE).toString(),
      feesClaimableQuote: claimable.toString(),
      feesClaimedQuote: claimed.toString(),
      quoteSymbol: deps.env.QUOTE_SYMBOL,
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
