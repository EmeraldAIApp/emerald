// DEVELOPMENT ONLY. Fake /api/* with the EXACT contract shapes (SSE included), for `npm run dev:mock`.
// Test commands in the chat input: /quota /paused /llm-error /bad /down
import { genericAnswer, MOCK_ANSWERS } from './verdicts.js'

export interface MockState { checks: number; used: number; signedIn: boolean }
export interface MockOpts { delayMs: number; now: () => Date }

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } })

const nextMidnight = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())
const frame = (event: string, data: unknown) => new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
const SSE = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' }
// Like the real API (plan 1, decision 10): /api/chat ALWAYS answers 200 text/event-stream, and bad_input/quota/paused
// arrive as a single `event: error` {code, message}, without tier/limit/resetAt. The JSON 400/429 are /api/check only.
const sseError = (code: 'bad_input' | 'quota' | 'paused', message: string) =>
  new Response(`event: error\ndata: ${JSON.stringify({ code, message })}\n\n`, { status: 200, headers: SSE })

export function createMockApi(opts: MockOpts) {
  const state: MockState = { checks: 0, used: 0, signedIn: false }

  function quota() {
    return state.signedIn
      ? { tier: 'holder' as const, limit: 100, used: state.used, resetAt: nextMidnight(opts.now()) }
      : { tier: 'anon' as const, limit: 5, used: state.used, resetAt: nextMidnight(opts.now()) }
  }

  async function chat(req: Request): Promise<Response> {
    let body: { input?: unknown }
    try {
      body = (await req.json()) as { input?: unknown }
    } catch {
      return sseError('bad_input', 'Paste an address, a transaction hash, a transaction or a signature request.')
    }
    const input = typeof body.input === 'string' ? body.input.trim() : ''
    if (!input || input === '/bad') return sseError('bad_input', 'Paste an address, a transaction hash, a transaction or a signature request.')
    if (input === '/down') return new Response('upstream down', { status: 502 })
    const q = quota()
    if (input === '/quota') return sseError('quota', `Daily limit reached (${q.limit}/day for ${q.tier}). Resets at ${q.resetAt}.`)
    if (input === '/paused') return sseError('paused', `Free checks are paused for today: the daily compute budget is spent. Resets at ${q.resetAt}.`)
    state.used++
    state.checks++
    const answer = input === '/llm-error' ? genericAnswer(input) : (MOCK_ANSWERS[input] ?? genericAnswer(input))
    const words = answer.explanation.split(/(?<=\s)/)
    const stream = new ReadableStream<Uint8Array>({
      async start(c) {
        await sleep(opts.delayMs * 6) // the engine takes time: the "Reading…" state shows
        c.enqueue(frame('verdict', answer.verdict))
        for (let i = 0; i < words.length; i += 3) {
          if (input === '/llm-error' && i >= 6) {
            c.enqueue(frame('error', { code: 'llm', message: 'mock refusal' }))
            break
          }
          await sleep(opts.delayMs)
          c.enqueue(frame('delta', { text: words.slice(i, i + 3).join('') }))
        }
        c.enqueue(frame('done', { usage: { inputTokens: 1300, outputTokens: 350, costUsd: 0.0112 } }))
        c.close()
      },
    })
    return new Response(stream, { status: 200, headers: SSE })
  }

  async function handle(req: Request): Promise<Response | null> {
    const url = new URL(req.url)
    const route = `${req.method} ${url.pathname}`
    switch (route) {
      case 'POST /api/chat':
        return chat(req)
      case 'GET /api/quota':
        return json(quota())
      case 'GET /api/compute':
        return json({ llmUsd: state.checks * 0.0112, checksRun: state.checks, feesClaimableWei: '0', feesClaimedWei: '0', updatedAt: opts.now().toISOString() })
      case 'GET /api/auth/nonce':
        return json({ nonce: `mock${Math.random().toString(36).slice(2, 12)}` }, 200, { 'set-cookie': 'em_nonce=mock; Path=/; HttpOnly; SameSite=Strict' })
      case 'POST /api/auth/verify': {
        const b = (await req.json().catch(() => ({}))) as { message?: unknown; signature?: unknown }
        const address = typeof b.message === 'string' ? /\n(0x[0-9a-fA-F]{40})\n/.exec(b.message)?.[1] : undefined
        if (!address || typeof b.signature !== 'string') return json({ error: 'bad_input' }, 400)
        state.signedIn = true
        return json({ address, tier: 'holder', limit: 100 }, 200, { 'set-cookie': 'em_session=mock; Path=/; HttpOnly; SameSite=Lax' })
      }
      default:
        return url.pathname.startsWith('/api/') ? json({ error: 'not_found' }, 404) : null
    }
  }

  return { handle, state }
}
