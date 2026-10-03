import { resolveAccess } from '../access.js'
import type { Deps } from '../deps.js'
import { isCrossSite, json, rawJson } from '../http.js'
import { consume } from '../quota.js'
import { runVerdict } from '../verdict.js'
import { readCheckBody } from './body.js'

/** POST /api/check {input, userAddress?} -> 200 Verdict | 400 bad_input | 429 quota/paused. */
export function makeCheckHandler(getDeps: () => Deps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'POST') return json({ error: 'method' }, 405)
    const deps = getDeps()
    if (isCrossSite(req, deps.env.PUBLIC_HOST)) return json({ error: 'forbidden' }, 403)
    const body = await readCheckBody(req)
    if (!body) return json({ error: 'bad_input' }, 400)
    try {
      const access = await resolveAccess(req, deps)
      const q = await consume(deps.store, { tier: access.tier, id: access.id, spendCapUsd: deps.env.DAILY_SPEND_CAP_USD, nowMs: deps.now().getTime() })
      if (!q.ok) return json({ error: q.reason, tier: q.tier, limit: q.limit, resetAt: q.resetAt }, 429)
      return rawJson(await runVerdict(deps, body.input, body.userAddress))
    } catch (e) {
      console.error('[emerald] /api/check', e)
      return json({ error: 'unavailable' }, 503)
    }
  }
}
