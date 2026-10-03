import { describe, expect, it, vi } from 'vitest'
import { frameToEvent, streamChat, type ClientEvent } from '../src/chat/client.js'
import { RED, frame, sseResponse } from './fixtures.js'

async function collect(res: Response | Error, req = { input: 'x' }) {
  const events: ClientEvent[] = []
  const fetchImpl = vi.fn(async () => {
    if (res instanceof Error) throw res
    return res
  })
  await streamChat(req, (e) => events.push(e), { fetchImpl: fetchImpl as unknown as typeof fetch })
  return { events, fetchImpl }
}

describe('frameToEvent', () => {
  it('validates verdict frames and drops malformed ones', () => {
    expect(frameToEvent('verdict', JSON.stringify(RED))).toEqual({ type: 'verdict', verdict: RED })
    expect(frameToEvent('verdict', JSON.stringify({ ...RED, level: 'purple' }))).toBeNull()
    expect(frameToEvent('verdict', '{not json')).toBeNull()
  })
  it('maps unknown error codes to llm', () => {
    expect(frameToEvent('error', '{"code":"quota","message":"m"}')).toEqual({ type: 'error', code: 'quota', message: 'm' })
    expect(frameToEvent('error', '{"code":"weird"}')).toEqual({ type: 'error', code: 'llm', message: '' })
  })
  it('keeps done without usage', () => {
    expect(frameToEvent('done', '{}')).toEqual({ type: 'done', usage: null })
  })
})

describe('streamChat', () => {
  it('posts the request as JSON and emits verdict, deltas, done, end in order', async () => {
    const body = frame('verdict', RED) + frame('delta', { text: 'Do not ' }) + frame('delta', { text: 'sign.' }) +
      frame('done', { usage: { inputTokens: 1, outputTokens: 2, costUsd: 0.01 } })
    const { events, fetchImpl } = await collect(sseResponse([body.slice(0, 17), body.slice(17)]), { input: '0xabc', userAddress: '0x1' } as never)
    expect(events.map((e) => e.type)).toEqual(['verdict', 'delta', 'delta', 'done', 'end'])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/chat')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ input: '0xabc', userAddress: '0x1' })
  })

  it('reports a 429 JSON body as http', async () => {
    const res = new Response(JSON.stringify({ error: 'quota', tier: 'anon', limit: 5, resetAt: '2026-10-01T00:00:00.000Z' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    })
    const { events } = await collect(res)
    expect(events).toEqual([{ type: 'http', status: 429, body: { error: 'quota', tier: 'anon', limit: 5, resetAt: '2026-10-01T00:00:00.000Z' } }])
  })

  it('reports a non-JSON 500 as http with null body', async () => {
    const { events } = await collect(new Response('boom', { status: 500 }))
    expect(events).toEqual([{ type: 'http', status: 500, body: null }])
  })

  it('reports fetch failures as network', async () => {
    const { events } = await collect(new TypeError('Failed to fetch'))
    expect(events).toEqual([{ type: 'network', message: 'Failed to fetch' }])
  })
})
