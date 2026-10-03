import { resolveAccess } from '../access.js'
import type { Deps } from '../deps.js'
import { json } from '../http.js'
import { usage } from '../quota.js'

/** GET /api/quota -> {tier, limit, used, resetAt} (no consume). */
export function makeQuotaHandler(getDeps: () => Deps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'GET') return json({ error: 'method' }, 405)
    const deps = getDeps()
    try {
      const a = await resolveAccess(req, deps)
      return json(await usage(deps.store, { tier: a.tier, id: a.id, nowMs: deps.now().getTime() }))
    } catch (e) {
      console.error('[emerald] /api/quota', e)
      return json({ error: 'unavailable' }, 503)
    }
  }
}
