import { describe, expect, it, vi } from 'vitest'
import { makeChatHandler } from '../handlers/chat.js'
import { makeCheckHandler } from '../handlers/check.js'
import { makeQuotaHandler } from '../handlers/quota.js'
import { WORST_CASE_COST_USD } from '../llm.js'
import { STATS_LLM_USD } from '../quota.js'
import type { Captured } from './anthropic-fake.js'
import { fakeDeps, get, parseSse, post, RED_VERDICT } from './helpers.js'

const DRAINER = '0x00001f78189bE22C3498cFF1B8e02272C3220000'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/** Polls until cond() is true (or ms elapse); the caller asserts afterwards. */
async function waitFor(cond: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  for (const t0 = Date.now(); Date.now() - t0 < ms && !(await cond()); ) await sleep(10)
}

describe('POST /api/check', () => {
  it('200 with the verdict JSON', async () => {
    const res = await makeCheckHandler(() => fakeDeps())(post('/api/check', { input: DRAINER }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toMatchObject({ level: 'red', headline: "Don't sign." })
  })
  it('400 bad_input for unrecognized input, missing input, a bad userAddress or a body that is not an object', async () => {
    const h = makeCheckHandler(() => fakeDeps())
    // null/123/"x"/[] are valid JSON but not a {input} object: they must answer 400, never throw (a throw is a Vercel 500).
    for (const body of [{ input: 'hello' }, {}, { input: DRAINER, userAddress: 'me' }, null, 123, 'x', []]) {
      const res = await h(post('/api/check', body))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'bad_input' })
    }
  })
  it('429 quota after 5 anonymous checks from the same IP', async () => {
    const deps = fakeDeps()
    const h = makeCheckHandler(() => deps)
    for (let i = 0; i < 5; i++) expect((await h(post('/api/check', { input: DRAINER }))).status).toBe(200)
    const res = await h(post('/api/check', { input: DRAINER }))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'quota', tier: 'anon', limit: 5, resetAt: '2026-10-01T00:00:00.000Z' })
  })
  it('405 on GET', async () => {
    expect((await makeCheckHandler(() => fakeDeps())(get('/api/check'))).status).toBe(405)
  })
})

describe('cross-site POSTs (a <form> on another site) never reach the quota or the LLM', () => {
  const formPost = (path: string) =>
    new Request(`https://emerald.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-real-ip': '9.9.9.9' },
      body: `{"input":"${DRAINER}","x":"="}`,
    })
  const quotaUsed = async (deps: ReturnType<typeof fakeDeps>) => ((await (await makeQuotaHandler(() => deps)(get('/api/quota'))).json()) as { used: number }).used

  it('a body that is not sent as application/json is bad_input and consumes nothing', async () => {
    const deps = fakeDeps()
    const res = await makeCheckHandler(() => deps)(formPost('/api/check'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad_input' })
    const chat = parseSse(await (await makeChatHandler(() => deps)(formPost('/api/chat'))).text())
    expect(chat).toEqual([{ event: 'error', data: { code: 'bad_input', message: expect.any(String) } }])
    expect(deps.engineCalls).toBe(0)
    expect(await quotaUsed(deps)).toBe(0)
  })

  it('an Origin from another site (or "null", or Sec-Fetch-Site cross-site) is 403; same origin and no Origin (curl) pass', async () => {
    const deps = fakeDeps()
    const check = makeCheckHandler(() => deps)
    const crossSite: Record<string, string>[] = [{ origin: 'https://evil.test' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]
    for (const h of crossSite) {
      const res = await check(post('/api/check', { input: DRAINER }, h))
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden' })
      expect((await makeChatHandler(() => deps)(post('/api/chat', { input: DRAINER }, h))).status).toBe(403)
    }
    expect(deps.engineCalls).toBe(0)
    expect(await quotaUsed(deps)).toBe(0)
    expect((await check(post('/api/check', { input: DRAINER }, { origin: 'https://emerald.test', 'sec-fetch-site': 'same-origin' }))).status).toBe(200)
    expect((await check(post('/api/check', { input: DRAINER }))).status).toBe(200)
  })
})

describe('POST /api/chat (SSE)', () => {
  it('verdict -> delta* -> done, and the LLM cost is added to the spend counters', async () => {
    const deps = fakeDeps()
    const res = await makeChatHandler(() => deps)(post('/api/chat', { input: DRAINER }))
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
    const events = parseSse(await res.text())
    expect(events.map((e) => e.event)).toEqual(['verdict', 'delta', 'delta', 'done'])
    expect(events[0]!.data).toMatchObject({ level: 'red' })
    expect(events[1]!.data).toEqual({ text: 'Do not sign. ' })
    expect(events[3]!.data).toMatchObject({ usage: { inputTokens: 1300, outputTokens: 350 } })
    expect(await deps.store.getNumber(STATS_LLM_USD)).toBeCloseTo(0.0112)
  })
  it('is progressive: the verdict frame arrives before the explanation finishes', async () => {
    const deps = fakeDeps({ llmDelayMs: 800 })
    const t0 = Date.now()
    const res = await makeChatHandler(() => deps)(post('/api/chat', { input: DRAINER }))
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    const first = dec.decode((await reader.read()).value)
    expect(first.startsWith('event: verdict')).toBe(true)
    expect(Date.now() - t0).toBeLessThan(400) // does not wait for the LLM (which takes 800 ms)
    let rest = ''
    for (let r = await reader.read(); !r.done; r = await reader.read()) rest += dec.decode(r.value)
    expect(rest).toContain('event: done')
    expect(Date.now() - t0).toBeGreaterThanOrEqual(750)
  })
  it('bad input -> single error event with code bad_input (also for a body that is not an object)', async () => {
    const h = makeChatHandler(() => fakeDeps())
    for (const body of [{ input: 'hola' }, null, 123, 'x', []]) {
      const res = await h(post('/api/chat', body))
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
      expect(parseSse(await res.text())).toEqual([{ event: 'error', data: { code: 'bad_input', message: expect.any(String) } }])
    }
  })
  it('spend cap reached -> error paused (anon)', async () => {
    const deps = fakeDeps({ env: { DAILY_SPEND_CAP_USD: '0' } })
    const events = parseSse(await (await makeChatHandler(() => deps)(post('/api/chat', { input: DRAINER }))).text())
    expect(events[0]).toMatchObject({ event: 'error', data: { code: 'paused' } })
  })
  it('no ANTHROPIC_API_KEY -> verdict then error llm (the verdict still arrives)', async () => {
    const deps = fakeDeps({ env: { ANTHROPIC_API_KEY: '' } })
    const events = parseSse(await (await makeChatHandler(() => deps)(post('/api/chat', { input: DRAINER }))).text())
    expect(events.map((e) => e.event)).toEqual(['verdict', 'error'])
    expect(events[1]!.data).toMatchObject({ code: 'llm' })
  })
})

describe('POST /api/chat: client leaves mid-stream (spend accounting)', () => {
  // The daily cap is tiny so that the daily spend counter is observable too: once more than 0.02 USD is booked,
  // the next anonymous check is answered `paused`.
  const CAPPED = { DAILY_SPEND_CAP_USD: '0.02' }
  const nextCheckStatus = async (deps: ReturnType<typeof fakeDeps>) =>
    (await makeCheckHandler(() => deps)(post('/api/check', { input: DRAINER }))).status

  it('leaving while the engine is still running books nothing: no Anthropic request was made', async () => {
    const captured: Captured[] = []
    let engineDone = () => {}
    const finished = new Promise<void>((r) => (engineDone = r))
    const deps = fakeDeps({
      env: CAPPED,
      captured,
      engine: async () => {
        await sleep(200)
        engineDone()
        return RED_VERDICT
      },
    })
    const res = await makeChatHandler(() => deps)(post('/api/chat', { input: DRAINER }))
    await res.body!.cancel()
    await finished
    await sleep(100) // let the handler's continuation (after runVerdict) run
    expect(captured).toHaveLength(0)
    expect(await deps.store.getNumber(STATS_LLM_USD)).toBe(0)
    expect(await nextCheckStatus(deps)).toBe(200) // the daily cap was not consumed by a phantom charge
  })

  it('leaving while the LLM is running books the worst-case cost (Anthropic bills what was generated)', async () => {
    const captured: Captured[] = []
    const deps = fakeDeps({ env: CAPPED, llmDelayMs: 300, captured })
    const res = await makeChatHandler(() => deps)(post('/api/chat', { input: DRAINER }))
    const reader = res.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value).startsWith('event: verdict')).toBe(true)
    await waitFor(() => captured.length === 1) // the Anthropic request is really in flight
    expect(captured).toHaveLength(1)
    await reader.cancel()
    await waitFor(async () => (await deps.store.getNumber(STATS_LLM_USD)) > 0)
    expect(await deps.store.getNumber(STATS_LLM_USD)).toBeCloseTo(WORST_CASE_COST_USD)
    expect(await nextCheckStatus(deps)).toBe(429) // the daily spend counter got it too: 0.03 >= 0.02 cap
  })
})

describe('POST /api/chat: time budget', () => {
  it('an explanation that runs past its budget is cut: error llm after the verdict, worst-case spend booked', async () => {
    const captured: Captured[] = []
    const deps = fakeDeps({ llmDelayMs: 3000, captured })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined) // the cut is logged; keep the output clean
    const t0 = Date.now()
    const res = await makeChatHandler(() => deps, { llmBudgetMs: 300 })(post('/api/chat', { input: DRAINER }))
    const events = parseSse(await res.text())
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(events.map((e) => e.event)).toEqual(['verdict', 'error'])
    expect(events[1]!.data).toMatchObject({ code: 'llm' })
    expect(captured).toHaveLength(1)
    await waitFor(async () => (await deps.store.getNumber(STATS_LLM_USD)) > 0)
    expect(await deps.store.getNumber(STATS_LLM_USD)).toBeCloseTo(WORST_CASE_COST_USD)
    expect(logged).toHaveBeenCalledWith('[emerald] /api/chat llm', expect.anything())
    logged.mockRestore()
  })

  it('when the request budget is almost spent, no Anthropic request is made', async () => {
    const captured: Captured[] = []
    const deps = fakeDeps({ captured })
    const res = await makeChatHandler(() => deps, { requestBudgetMs: 500 })(post('/api/chat', { input: DRAINER }))
    const events = parseSse(await res.text())
    expect(events.map((e) => e.event)).toEqual(['verdict', 'error'])
    expect(captured).toHaveLength(0)
    expect(await deps.store.getNumber(STATS_LLM_USD)).toBe(0)
  })
})

describe('GET /api/quota', () => {
  it('reports usage without consuming', async () => {
    const deps = fakeDeps()
    await makeCheckHandler(() => deps)(post('/api/check', { input: DRAINER }))
    const res = await makeQuotaHandler(() => deps)(get('/api/quota'))
    expect(await res.json()).toEqual({ tier: 'anon', limit: 5, used: 1, resetAt: '2026-10-01T00:00:00.000Z' })
    const again = await makeQuotaHandler(() => deps)(get('/api/quota'))
    expect(await again.json()).toMatchObject({ used: 1 })
  })
})
