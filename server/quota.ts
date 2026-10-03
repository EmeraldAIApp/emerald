import { FOREVER, type Store } from './redis.js'

export type Tier = 'anon' | 'holder' | 'whale'
/** anon: 5/day per IP · holder (>= 100k $EMERALD): 100/day · whale (>= 1M): no advertised limit (fair use 1000/day). */
export const LIMITS: Record<Tier, number | null> = { anon: 5, holder: 100, whale: null }
export const WHALE_FAIR_USE = 1000
export const HOLDER_MIN = 100_000n
export const WHALE_MIN = 1_000_000n

export const STATS_CHECKS = 'em:stats:checks'
export const STATS_LLM_USD = 'em:stats:llm_usd'

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10).replaceAll('-', '')
}
export function nextUtcMidnight(nowMs: number): number {
  const d = new Date(nowMs)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
}
const quotaKey = (tier: Tier, id: string, nowMs: number) => `em:q:${tier}:${id}:${utcDay(nowMs)}`
const spendKey = (nowMs: number) => `em:spend:${utcDay(nowMs)}`

export interface QuotaResult {
  ok: boolean
  reason?: 'quota' | 'paused'
  tier: Tier
  limit: number | null
  used: number
  resetAt: string
}

/** Consumes one check. The anonymous tier pauses when the day's spend passes the cap. */
export async function consume(store: Store, o: { tier: Tier; id: string; spendCapUsd: number; nowMs: number }): Promise<QuotaResult> {
  const resetMs = nextUtcMidnight(o.nowMs)
  const limit = LIMITS[o.tier]
  const hard = limit ?? WHALE_FAIR_USE
  const base = { tier: o.tier, limit, resetAt: new Date(resetMs).toISOString() }
  const key = quotaKey(o.tier, o.id, o.nowMs)
  if (o.tier === 'anon' && (await store.getNumber(spendKey(o.nowMs))) >= o.spendCapUsd) {
    return { ok: false, reason: 'paused', used: Math.min(await store.getNumber(key), hard), ...base }
  }
  const n = await store.incrExpireAt(key, Math.floor(resetMs / 1000) + 3600)
  if (n > hard) return { ok: false, reason: 'quota', used: hard, ...base }
  return { ok: true, used: n, ...base }
}

/** Today's usage without consuming (GET /api/quota). */
export async function usage(store: Store, o: { tier: Tier; id: string; nowMs: number }): Promise<Omit<QuotaResult, 'ok' | 'reason'>> {
  const limit = LIMITS[o.tier]
  const used = Math.min(await store.getNumber(quotaKey(o.tier, o.id, o.nowMs)), limit ?? WHALE_FAIR_USE)
  return { tier: o.tier, limit, used, resetAt: new Date(nextUtcMidnight(o.nowMs)).toISOString() }
}

/** Adds LLM spend to the daily cap and to the public counter. */
export async function addSpend(store: Store, usd: number, nowMs: number): Promise<void> {
  await store.incrFloatExpireAt(spendKey(nowMs), usd, Math.floor(nextUtcMidnight(nowMs) / 1000) + 3600)
  await store.incrFloatExpireAt(STATS_LLM_USD, usd, FOREVER)
}

/** Tier from the whole $EMERALD balance (no decimals). */
export function tierForBalance(whole: bigint): Tier {
  if (whole >= WHALE_MIN) return 'whale'
  if (whole >= HOLDER_MIN) return 'holder'
  return 'anon'
}
