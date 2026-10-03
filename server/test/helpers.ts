import { stubSources, type SourceStubs } from '../../engine/test/helpers/stub-sources.js'
import type { Verdict } from '../../engine/types.js'
import type { Deps, Engine } from '../deps.js'
import { readEnv } from '../env.js'
import { makeClient } from '../llm.js'
import { MemoryStore } from '../redis.js'
import { fakeAnthropicFetch, type Captured } from './anthropic-fake.js'

export const SECRET = 'test-secret-'.padEnd(40, 'x')
export const NOW = new Date('2026-09-30T20:00:00Z')

export const RED_VERDICT: Verdict = {
  level: 'red',
  headline: "Don't sign.",
  reasons: [{ code: 'PERMIT2_UNKNOWN_SPENDER', check: 'decode', severity: 'danger', text: 'bad spender' }],
  checksOk: ['decode', 'labels'],
  checksFailed: [],
  input: { kind: 'address', address: '0x00001f78189bE22C3498cFF1B8e02272C3220000' },
  chainId: 1,
  engineVersion: '1.0.0',
}

export interface FakeDepsOpts {
  env?: Record<string, string>
  engine?: Engine
  sources?: SourceStubs
  llmTexts?: string[]
  /** Delay of the fake Anthropic before the first frame (to prove the SSE is progressive). */
  llmDelayMs?: number
  captured?: Captured[]
  now?: () => Date
}

export function fakeDeps(o: FakeDepsOpts = {}): Deps & { store: MemoryStore; engineCalls: number } {
  const now = o.now ?? (() => NOW)
  const env = readEnv({ SESSION_SECRET: SECRET, ANTHROPIC_API_KEY: 'sk-test', ...o.env })
  const deps = {
    env,
    store: new MemoryStore(() => now().getTime()),
    sources: stubSources(o.sources),
    engineCalls: 0,
    engine: (async () => RED_VERDICT) as Engine,
    llm: makeClient(env, fakeAnthropicFetch({
      texts: o.llmTexts ?? ['Do not sign. ', 'It is a drainer.'],
      usage: { input_tokens: 400, cache_read_input_tokens: 900, cache_creation_input_tokens: 0, output_tokens: 350 },
      ...(o.llmDelayMs ? { delayMs: o.llmDelayMs } : {}),
      captured: o.captured ?? [],
    })),
    now,
  }
  const engine = o.engine ?? (async () => RED_VERDICT)
  deps.engine = async (input, ctx) => {
    deps.engineCalls++
    return engine(input, ctx)
  }
  return deps
}

export function parseSse(text: string): { event: string; data: unknown }[] {
  return text
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((f) => ({
      event: /^event: (.*)$/m.exec(f)?.[1] ?? '',
      data: JSON.parse(/^data: (.*)$/m.exec(f)?.[1] ?? 'null') as unknown,
    }))
}

export const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://emerald.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '9.9.9.9', ...headers }, body: JSON.stringify(body) })
export const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://emerald.test${path}`, { method: 'GET', headers: { 'x-real-ip': '9.9.9.9', ...headers } })
