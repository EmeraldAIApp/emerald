import { readCompute } from '../compute.js'
import type { Deps } from '../deps.js'
import { json } from '../http.js'

/** GET /api/compute -> {llmUsd, checksRun, feesClaimableWei, feesClaimedWei, updatedAt}. */
export function makeComputeHandler(getDeps: () => Deps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'GET') return json({ error: 'method' }, 405)
    try {
      // s-maxage: Vercel's CDN caches it too, so a burst of page views does not reach Redis or the RPC.
      return json(await readCompute(getDeps()), 200, { 'cache-control': 'public, max-age=30, s-maxage=30' })
    } catch (e) {
      console.error('[emerald] /api/compute', e)
      return json({ error: 'unavailable' }, 503)
    }
  }
}
