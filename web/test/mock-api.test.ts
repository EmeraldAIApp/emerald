import { describe, expect, it } from 'vitest'
import { createMockApi } from '../mock/api.js'
import { streamChat } from '../src/chat/client.js'
import { IDLE, reduce, type ChatState } from '../src/chat/machine.js'
import { SAMPLES } from '../src/chat/samples.js'
import { isComputeInfo, isQuotaInfo } from '../src/chat/wire.js'

function setup() {
  const api = createMockApi({ delayMs: 0, now: () => new Date('2026-09-30T20:00:00Z') })
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const r = await api.handle(new Request(`http://mock${url}`, init))
    return r ?? new Response('no route', { status: 404 })
  }) as unknown as typeof fetch
  async function ask(input: string): Promise<ChatState> {
    let s = reduce(IDLE, { type: 'submit', input })
    await streamChat({ input }, (e) => (s = reduce(s, e)), { fetchImpl })
    return s
  }
  return { api, fetchImpl, ask }
}

describe('mock API through the real client and state machine', () => {
  it('Permit2 drainer sample ends red with a full explanation', async () => {
    const s = await setup().ask(SAMPLES['permit2-drainer'].input)
    expect(s.kind).toBe('verdict')
    if (s.kind !== 'verdict') return
    expect(s.verdict.level).toBe('red')
    expect(s.streaming).toBe(false)
    expect(s.explanation).toContain('Inferno Drainer')
    expect(s.usage).toEqual({ inputTokens: 1300, outputTokens: 350, costUsd: 0.0112 })
  })

  it('poisoned address sample ends red and says what it could not check', async () => {
    const s = await setup().ask(SAMPLES['poisoned-address'].input)
    expect(s).toMatchObject({ kind: 'verdict', verdict: { level: 'red', checksFailed: ['simulate'] } })
  })

  it('test commands reach every state', async () => {
    const { ask } = setup()
    // Like the real API: the SSE error carries no tier/limit/resetAt (the screen falls back to "You’ve used your checks for today. More at 00:00 UTC.").
    expect(await ask('/quota')).toMatchObject({ kind: 'quota', reason: 'quota', tier: null, limit: null, resetAt: null })
    expect(await ask('/paused')).toMatchObject({ kind: 'quota', reason: 'paused' })
    expect(await ask('/bad')).toMatchObject({ kind: 'error', error: 'bad_input' })
    expect(await ask('/down')).toMatchObject({ kind: 'error', error: 'server' })
    expect(await ask('/llm-error')).toMatchObject({ kind: 'verdict', llmFailed: true, explanation: '', streaming: false })
    expect(await ask('hello')).toMatchObject({ kind: 'verdict', verdict: { level: 'yellow', input: { kind: 'unknown', raw: 'hello' } } })
  })

  it('quota and compute answer with the contract shapes', async () => {
    const { ask, fetchImpl } = setup()
    await ask('hello')
    const q = await (await fetchImpl('/api/quota')).json()
    expect(isQuotaInfo(q)).toBe(true)
    expect(q).toMatchObject({ tier: 'anon', limit: 5, used: 1 })
    const c = await (await fetchImpl('/api/compute')).json()
    expect(isComputeInfo(c)).toBe(true)
    expect(c).toMatchObject({ checksRun: 1, feesClaimedWei: '0' })
  })
})
