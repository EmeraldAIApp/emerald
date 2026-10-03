import { createHash } from 'node:crypto'
import { serializeVerdict } from '../engine/index.js'
import type { Hex, Verdict } from '../engine/types.js'
import type { Deps } from './deps.js'
import { STATS_CHECKS } from './quota.js'
import { FOREVER } from './redis.js'

const VERDICT_TTL_S = 600

/**
 * Runs the engine with a 10-min cache keyed by hash of (input, user): the "Try a real scam" buttons
 * must not hammer GoPlus. Verdicts with sources down are not cached. Returns the JSON (one line).
 */
export async function runVerdict(deps: Deps, input: string, userAddress?: Hex): Promise<string> {
  // The own CA is part of the key: when EMERALD_TOKEN_ADDRESS is set at launch, an old verdict for the CA
  // (yellow, CONTRACT_NEW) cannot hide the "This is me." that plan 3 checks (verify-launch --site).
  const self = deps.env.EMERALD_TOKEN_ADDRESS?.toLowerCase() ?? ''
  const key = `em:v:${createHash('sha256').update(`${input.trim()}|${userAddress?.toLowerCase() ?? ''}|${self}`).digest('hex')}`
  try {
    const hit = await deps.store.getJson<string>(key)
    if (hit) return hit
  } catch (e) {
    console.error('[emerald] cache', e) // Redis down: run anyway
  }
  const v: Verdict = await deps.engine(input, { userAddress, selfTokenAddress: deps.env.EMERALD_TOKEN_ADDRESS, now: deps.now() })
  const json = serializeVerdict(v)
  try {
    if (v.checksFailed.length === 0) await deps.store.setJson(key, json, VERDICT_TTL_S)
    await deps.store.incrExpireAt(STATS_CHECKS, FOREVER)
  } catch (e) {
    console.error('[emerald] cache', e) // counter and cache are best-effort
  }
  return json
}
