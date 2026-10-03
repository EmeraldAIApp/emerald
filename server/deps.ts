import type Anthropic from '@anthropic-ai/sdk'
import { runChecks } from '../engine/index.js'
import { withDeadline } from '../engine/sources/deadline.js'
import { liveSources } from '../engine/sources/index.js'
import type { Hex, Sources, Verdict } from '../engine/types.js'
import { cachedSources } from './cache.js'
import { readEnv, type Env } from './env.js'
import { makeClient } from './llm.js'
import { storeFromEnv, type Store } from './redis.js'

export type Engine = (input: string, ctx: { userAddress?: Hex; selfTokenAddress?: Hex; now: Date }) => Promise<Verdict>

/** Everything the handlers need. Tests pass fake versions. */
export interface Deps {
  env: Env
  store: Store
  sources: Sources
  engine: Engine
  llm: Anthropic
  now: () => Date
}

let cached: Deps | null = null

/**
 * Time budget for the engine (sources included), so /api/check and /api/chat answer inside Vercel's maxDuration (60 s)
 * even when sources hang: a hung source becomes a failed check (yellow) instead of a killed function.
 */
export const ENGINE_BUDGET_MS = 25_000

export function engineWithBudget(sources: Sources, budgetMs = ENGINE_BUDGET_MS): Engine {
  return (input, ctx) => runChecks(input, { ...ctx, sources: withDeadline(sources, Date.now() + budgetMs) })
}

/** Real dependencies (once per function instance). */
export function liveDeps(): Deps {
  if (cached) return cached
  const env = readEnv()
  const store = storeFromEnv(env)
  const sources = cachedSources(liveSources({ rpcUrl: env.RPC_URL }), store)
  cached = {
    env,
    store,
    sources,
    engine: engineWithBudget(sources),
    llm: makeClient(env),
    now: () => new Date(),
  }
  return cached
}
