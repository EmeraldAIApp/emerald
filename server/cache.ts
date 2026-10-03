import { SourceError } from '../engine/sources/http.js'
import type { Hex, Sources } from '../engine/types.js'
import type { Store } from './redis.js'

const HOUR = 3600
/** After a GoPlus 4029, every GoPlus call fails fast for this long instead of hitting the limit again. */
const GOPLUS_RL_KEY = 'em:c:gp:rl'
const GOPLUS_RL_TTL_S = 60
const logCache = (e: unknown) => console.error('[emerald] cache', e)

/**
 * Caches slow or rate-limited sources in Redis (GoPlus without a key: ~6 req/min per shared IP).
 * Only successful responses are cached; if Redis fails it goes straight to the source.
 */
export function cachedSources(s: Sources, store: Store): Sources {
  function wrap<A extends string, R>(name: string, ttl: number, fn: (a: A) => Promise<R>): (a: A) => Promise<R> {
    return async (a: A) => {
      const key = `em:c:${name}:${a.toLowerCase()}`
      try {
        const hit = await store.getJson<{ v: R }>(key)
        if (hit) return hit.v
      } catch (e) {
        logCache(e) // Redis down: continue without cache
      }
      const v = await fn(a)
      try {
        await store.setJson(key, { v }, ttl)
      } catch (e) {
        logCache(e)
      }
      return v
    }
  }
  // Negative cache of the GoPlus rate limit (only successes are cached above): while it lasts no request goes out,
  // so a burst of "Try a real scam" clicks does not keep the shared egress IP over the limit.
  function goplusGuard<R>(fn: (a: Hex) => Promise<R>): (a: Hex) => Promise<R> {
    return async (a: Hex) => {
      let limited = false
      try {
        limited = (await store.getJson<number>(GOPLUS_RL_KEY)) !== null
      } catch (e) {
        logCache(e) // Redis down: ask GoPlus
      }
      if (limited) throw new SourceError('goplus', 'rate_limited', 'rate limited in the last minute (cached)')
      try {
        return await fn(a)
      } catch (e) {
        if (e instanceof SourceError && e.kind === 'rate_limited') {
          await store.setJson(GOPLUS_RL_KEY, 1, GOPLUS_RL_TTL_S).catch(logCache)
        }
        throw e
      }
    }
  }
  return {
    ...s,
    goplus: {
      addressSecurity: wrap('gp:addr', 6 * HOUR, goplusGuard((a) => s.goplus.addressSecurity(a))),
      tokenSecurity: wrap('gp:token', 6 * HOUR, goplusGuard((a) => s.goplus.tokenSecurity(a))),
    },
    sourcify: {
      getContract: wrap('sf:contract', 24 * HOUR, (a: Hex) => s.sourcify.getContract(a)),
      resolvedAbi: wrap('sf:abi', 24 * HOUR, (a: Hex) => s.sourcify.resolvedAbi(a)),
    },
    openchain: {
      lookupFunctions: async (sel: Hex[]) => {
        const r = await wrap('oc', 24 * HOUR, (joined: string) => s.openchain.lookupFunctions(joined.split(',') as Hex[]))(sel.join(','))
        return r
      },
    },
    blockscout: {
      ...s.blockscout,
      getToken: wrap('bs:token', HOUR, (a: Hex) => s.blockscout.getToken(a)),
    },
  }
}
