import type { Sources } from '../types.js'
import { SourceError, type SourceId } from './http.js'

/**
 * Global time budget for one verdict. Every source call races against an absolute deadline (ms since epoch):
 * a source that hangs (instead of failing) turns into a `timeout` SourceError when the budget runs out, so the
 * check fails (SOURCE_FAILED, yellow) and the verdict still arrives before the serverless function is killed.
 * After the deadline no source is called at all. The underlying request is not aborted; it ends on its own timeout.
 */
export function withDeadline(s: Sources, deadlineAt: number, now: () => number = Date.now): Sources {
  function guard<T>(source: SourceId, call: () => Promise<T>): Promise<T> {
    const left = deadlineAt - now()
    const expired = () => new SourceError(source, 'timeout', 'time budget for this check is exhausted')
    if (left <= 0) return Promise.reject(expired())
    let timer: ReturnType<typeof setTimeout> | undefined
    const budget = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(expired()), left)
    })
    return Promise.race([call(), budget]).finally(() => clearTimeout(timer))
  }
  function wrap<T extends object>(source: SourceId, api: T): T {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(api)) {
      out[k] = typeof v === 'function' ? (...args: unknown[]) => guard(source, () => (v as (...a: unknown[]) => Promise<unknown>).apply(api, args)) : v
    }
    return out as T
  }
  return {
    rpc: wrap('rpc', s.rpc),
    blockscout: wrap('blockscout', s.blockscout),
    goplus: wrap('goplus', s.goplus),
    sourcify: wrap('sourcify', s.sourcify),
    openchain: wrap('openchain', s.openchain),
  }
}
