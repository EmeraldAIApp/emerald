import type { PublicClient } from 'viem'
import type { Hex } from '../../engine/types.js'
import { tierForAddress } from '../access.js'
import type { Deps } from '../deps.js'
import { clientIp, isCrossSite, json, parseCookies, requestHost, serializeCookie } from '../http.js'
import { LIMITS } from '../quota.js'
import { newSession, NONCE_COOKIE, NONCE_TTL_S, SESSION_COOKIE, SESSION_TTL_S, signToken, verifyToken, type NoncePayload } from '../session.js'
import { generateSiweNonce, verifyLogin } from '../siwe.js'

const nonceKey = (n: string) => `em:nonce:${n}`
/** Unauthenticated nonces per IP per minute: each one is a Redis write with a 5-min TTL. */
export const NONCE_PER_IP_PER_MIN = 10

/** GET /api/auth/nonce -> {nonce} + httpOnly cookie em_nonce (signed, 5 min). The nonce is single-use (Redis). 429 above the per-IP limit. */
export function makeNonceHandler(getDeps: () => Deps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'GET') return json({ error: 'method' }, 405)
    const deps = getDeps()
    const nonce = generateSiweNonce()
    try {
      const minute = Math.floor(deps.now().getTime() / 60_000)
      const n = await deps.store.incrExpireAt(`em:rl:nonce:${clientIp(req)}:${minute}`, (minute + 2) * 60)
      if (n > NONCE_PER_IP_PER_MIN) return json({ error: 'rate_limited' }, 429)
      await deps.store.setJson(nonceKey(nonce), 1, NONCE_TTL_S)
      const token = signToken<NoncePayload>({ nonce, exp: Math.floor(deps.now().getTime() / 1000) + NONCE_TTL_S }, deps.env.SESSION_SECRET)
      const res = json({ nonce })
      res.headers.append('set-cookie', serializeCookie(NONCE_COOKIE, token, { maxAge: NONCE_TTL_S, sameSite: 'Strict' }))
      return res
    } catch (e) {
      console.error('[emerald] /api/auth/nonce', e)
      return json({ error: 'unavailable' }, 503)
    }
  }
}

/** POST /api/auth/verify {message, signature} -> cookie em_session + {address, tier, limit}. */
export function makeVerifyHandler(getDeps: () => Deps, client: () => PublicClient) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'POST') return json({ error: 'method' }, 405)
    const deps = getDeps()
    if (isCrossSite(req, deps.env.PUBLIC_HOST)) return json({ error: 'forbidden' }, 403)
    const n = verifyToken<NoncePayload>(parseCookies(req.headers.get('cookie'))[NONCE_COOKIE], deps.env.SESSION_SECRET, deps.now().getTime())
    if (!n) return json({ error: 'nonce' }, 401)
    let body: { message?: unknown; signature?: unknown }
    try {
      body = (await req.json()) as typeof body
    } catch {
      return json({ error: 'bad_input' }, 400)
    }
    if (typeof body.message !== 'string' || typeof body.signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(body.signature)) {
      return json({ error: 'bad_input' }, 400)
    }
    try {
      if ((await deps.store.del(nonceKey(n.nonce))) !== 1) return json({ error: 'nonce' }, 401) // already used or expired
    } catch {
      return json({ error: 'unavailable' }, 503)
    }
    const r = await verifyLogin(client(), {
      message: body.message,
      signature: body.signature as Hex,
      domain: requestHost(req, deps.env.PUBLIC_HOST),
      nonce: n.nonce,
      now: deps.now(),
    })
    if (!r.ok) return json({ error: r.reason }, 401)
    const tier = await tierForAddress(deps, r.address)
    const res = json({ address: r.address, tier, limit: LIMITS[tier] })
    res.headers.append('set-cookie', serializeCookie(SESSION_COOKIE, newSession(r.address, deps.env.SESSION_SECRET, deps.now().getTime()), { maxAge: SESSION_TTL_S }))
    res.headers.append('set-cookie', serializeCookie(NONCE_COOKIE, '', { maxAge: 0, sameSite: 'Strict' }))
    return res
  }
}
