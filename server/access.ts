import type { Hex } from '../engine/types.js'
import type { Deps } from './deps.js'
import { clientIp, parseCookies } from './http.js'
import { tierForBalance, type Tier } from './quota.js'
import { SESSION_COOKIE, verifyToken, type SessionPayload } from './session.js'

const TIER_TTL_S = 600 // spec §1: 10-min cache
const DECIMALS_TTL_S = 24 * 3600

export interface Access {
  tier: Tier
  /** Quota key: IP for anon, address for holder/whale. */
  id: string
  address: Hex | null
}

const pad = (a: string) => a.slice(2).toLowerCase().padStart(64, '0')
const logTier = (e: unknown) => console.error('[emerald] tier', e)

/** A wallet's tier from balanceOf($EMERALD). With no token configured or if the RPC fails: anon. */
export async function tierForAddress(deps: Deps, address: Hex): Promise<Tier> {
  const token = deps.env.EMERALD_TOKEN_ADDRESS
  if (!token) return 'anon'
  const key = `em:tier:${token.toLowerCase()}:${address.toLowerCase()}`
  try {
    const hit = await deps.store.getJson<Tier>(key)
    if (hit) return hit
  } catch (e) {
    logTier(e) // continue without the cache
  }
  try {
    const decKey = `em:dec:${token.toLowerCase()}`
    let decimals = await deps.store.getJson<number>(decKey).catch((e: unknown) => (logTier(e), null))
    if (decimals === null) {
      decimals = Number(BigInt(await deps.sources.rpc.call(token, '0x313ce567'))) // decimals()
      await deps.store.setJson(decKey, decimals, DECIMALS_TTL_S).catch(logTier)
    }
    const balance = BigInt(await deps.sources.rpc.call(token, `0x70a08231${pad(address)}`)) // balanceOf(address)
    const tier = tierForBalance(balance / 10n ** BigInt(decimals))
    await deps.store.setJson(key, tier, TIER_TTL_S).catch(logTier)
    return tier
  } catch (e) {
    logTier(e) // a holder silently served as anon would look like a quota bug
    return 'anon'
  }
}

/** Who is asking: valid SIWE session (cookie em_session) -> tier by balance; otherwise, anonymous by IP. */
export async function resolveAccess(req: Request, deps: Deps): Promise<Access> {
  const ip = clientIp(req)
  const session = verifyToken<SessionPayload>(parseCookies(req.headers.get('cookie'))[SESSION_COOKIE], deps.env.SESSION_SECRET, deps.now().getTime())
  if (!session) return { tier: 'anon', id: ip, address: null }
  const tier = await tierForAddress(deps, session.address)
  return { tier, id: tier === 'anon' ? ip : session.address.toLowerCase(), address: session.address }
}
