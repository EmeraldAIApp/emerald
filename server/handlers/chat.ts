import { resolveAccess } from '../access.js'
import type { Deps } from '../deps.js'
import { isCrossSite, json, SSE_HEADERS, sseFrame, sseRaw } from '../http.js'
import { explain, WORST_CASE_COST_USD } from '../llm.js'
import { addSpend, consume, type QuotaResult } from '../quota.js'
import { runVerdict } from '../verdict.js'
import { readCheckBody } from './body.js'

type ErrorCode = 'quota' | 'paused' | 'llm' | 'bad_input'

function sseOnce(frames: Uint8Array[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const f of frames) c.enqueue(f)
        c.close()
      },
    }),
    { status: 200, headers: SSE_HEADERS },
  )
}
const errorFrame = (code: ErrorCode, message: string) => sseFrame('error', { code, message })
/** A spend that cannot be booked keeps the daily cap behind: never silent. */
const logSpend = (e: unknown) => console.error('[emerald] spend', e)

/** Whole request (Vercel maxDuration is 60 s, minus a margin). */
export const REQUEST_BUDGET_MS = 55_000
/** Streamed explanation, headers and body (the SDK timeout only covers the headers). */
export const LLM_BUDGET_MS = 30_000
/** Below this, starting the explanation is not worth it: the verdict alone is sent. */
const MIN_LLM_MS = 2_000

/**
 * POST /api/chat {input, userAddress?} -> text/event-stream:
 *   verdict (Verdict) -> delta* ({text}) -> done ({usage}) | error ({code, message}).
 * Consumes ONE quota check. The engine sets the color; the LLM only explains.
 */
export function makeChatHandler(getDeps: () => Deps, budget: { requestBudgetMs?: number; llmBudgetMs?: number } = {}) {
  const requestBudgetMs = budget.requestBudgetMs ?? REQUEST_BUDGET_MS
  const llmBudgetMs = budget.llmBudgetMs ?? LLM_BUDGET_MS
  return async function handle(req: Request): Promise<Response> {
    const started = Date.now()
    if (req.method !== 'POST') return json({ error: 'method' }, 405)
    const deps = getDeps()
    // Not an SSE error: only a page on another site gets here, and it must not spend the quota or the LLM budget.
    if (isCrossSite(req, deps.env.PUBLIC_HOST)) return json({ error: 'forbidden' }, 403)
    const body = await readCheckBody(req)
    if (!body) return sseOnce([errorFrame('bad_input', 'Paste an address, a transaction hash, a transaction or a signature request.')])
    let q: QuotaResult
    try {
      const access = await resolveAccess(req, deps)
      q = await consume(deps.store, { tier: access.tier, id: access.id, spendCapUsd: deps.env.DAILY_SPEND_CAP_USD, nowMs: deps.now().getTime() })
    } catch (e) {
      console.error('[emerald] /api/chat quota', e)
      return sseOnce([errorFrame('llm', 'Service temporarily unavailable.')])
    }
    if (!q.ok) {
      const msg = q.reason === 'paused'
        ? `Free checks are paused for today: the daily compute budget is spent. Resets at ${q.resetAt}.`
        : `Daily limit reached (${q.limit}/day for ${q.tier}). Resets at ${q.resetAt}.`
      return sseOnce([errorFrame(q.reason ?? 'quota', msg)])
    }

    const abort = new AbortController()
    req.signal?.addEventListener('abort', () => abort.abort())
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (chunk: Uint8Array) => {
          try {
            controller.enqueue(chunk)
          } catch {
            abort.abort() // the client left
          }
        }
        const close = () => {
          try {
            controller.close()
          } catch {
            // already closed or cancelled
          }
        }
        let verdictJson: string
        try {
          verdictJson = await runVerdict(deps, body.input, body.userAddress)
        } catch (e) {
          console.error('[emerald] /api/chat engine', e)
          send(errorFrame('llm', 'The checks could not run. Try again.'))
          close()
          return
        }
        send(sseRaw('verdict', verdictJson))
        if (abort.signal.aborted) {
          // The client left while the engine was running (or right when the verdict went out): no Anthropic request
          // exists, so there is nothing to bill. The worst-case charge below is only for a request that may be in flight.
          close()
          return
        }
        if (!deps.env.ANTHROPIC_API_KEY) {
          send(errorFrame('llm', 'Explanation unavailable. The verdict above is complete.'))
          close()
          return
        }
        const remaining = requestBudgetMs - (Date.now() - started)
        if (remaining < MIN_LLM_MS) {
          send(errorFrame('llm', 'Explanation unavailable. The verdict above is complete.'))
          close()
          return
        }
        const llmSignal = AbortSignal.any([abort.signal, AbortSignal.timeout(Math.min(llmBudgetMs, remaining))])
        const nowMs = deps.now().getTime()
        try {
          const r = await explain({
            client: deps.llm,
            model: deps.env.CLAUDE_MODEL,
            verdictJson,
            userInput: body.input,
            signal: llmSignal,
            onText: (text) => send(sseFrame('delta', { text })),
          })
          await addSpend(deps.store, r.costUsd, nowMs).catch(logSpend)
          if (r.refused) send(errorFrame('llm', 'The explanation was cut short. The verdict above is complete.'))
          send(sseFrame('done', { usage: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd } }))
        } catch (e) {
          // Cut by the client or by the time budget: Anthropic bills what was generated, so book the worst case.
          if (llmSignal.aborted) await addSpend(deps.store, WORST_CASE_COST_USD, nowMs).catch(logSpend)
          if (!abort.signal.aborted) {
            console.error('[emerald] /api/chat llm', e)
            send(errorFrame('llm', 'Explanation unavailable. The verdict above is complete.'))
          }
        } finally {
          close()
        }
      },
      cancel() {
        abort.abort()
      },
    })
    return new Response(stream, { status: 200, headers: SSE_HEADERS })
  }
}
