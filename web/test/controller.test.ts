// The chat must leave its busy state when the connection stalls without closing (mobile drop, proxy holding the socket).
// No DOM library in this repo: the controller only touches a handful of members, so the view is a small fake.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STALL_MS, mountChat, type ChatView } from '../src/chat/controller.js'
import { RED, frame } from './fixtures.js'

const enc = new TextEncoder()

function fakeView() {
  const noop = () => {}
  const view = {
    panel: { dataset: {} as Record<string, string> },
    screen: { innerHTML: '', querySelector: () => null, addEventListener: noop },
    form: { addEventListener: noop },
    input: { value: '', style: {} as Record<string, string>, scrollHeight: 0, addEventListener: noop },
    submit: { disabled: false },
    chips: { append: noop },
    announce: { textContent: '' },
  }
  return { view, asView: view as unknown as ChatView }
}

/** A response whose body never ends. Like a real fetch, aborting the request errors the body (or rejects the call). */
function stalledFetch(prefix = '') {
  let body: ReadableStreamDefaultController<Uint8Array> | undefined
  const send = (s: string) => body?.enqueue(enc.encode(s))
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        body = c
        if (prefix) c.enqueue(enc.encode(prefix))
        init?.signal?.addEventListener('abort', () => c.error(init.signal?.reason), { once: true })
      },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, send, calls: fetchImpl }
}

function mount(fetchImpl: typeof fetch) {
  const { view, asView } = fakeView()
  const chat = mountChat(asView, { canSignIn: false, userAddress: () => undefined, onChange: () => {}, onSettled: () => {}, onSignIn: () => {}, fetchImpl })
  return { chat, view }
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('stall guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('document', { createElement: () => ({ dataset: {}, addEventListener: () => {} }) })
  })
  afterEach(() => vi.useRealTimers())

  it('gives up on a connection that answers but never sends an event, and unlocks the panel', async () => {
    const s = stalledFetch()
    const { chat, view } = mount(s.fetchImpl)
    void chat.ask('0x0000000000000000000000000000000000000001')
    await tick(0)
    expect(chat.state.kind).toBe('checking')
    expect(view.submit.disabled).toBe(true)

    await tick(STALL_MS - 1)
    expect(chat.state.kind).toBe('checking')
    await tick(1)
    expect(chat.state).toMatchObject({ kind: 'error', error: 'network' })
    expect(view.submit.disabled).toBe(false)
    expect(view.screen.innerHTML).toContain('Couldn’t reach the checker. Try again in a minute.')

    // No reload needed: the next question goes out.
    void chat.ask('0x0000000000000000000000000000000000000002')
    await tick(0)
    expect(chat.state.kind).toBe('checking')
    expect(s.calls).toHaveBeenCalledTimes(2)
  })

  it('gives up on a call that never answers at all', async () => {
    const fetchImpl = vi.fn((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })),
    )
    const { chat, view } = mount(fetchImpl as unknown as typeof fetch)
    void chat.ask('0x0000000000000000000000000000000000000001')
    await tick(STALL_MS)
    expect(chat.state).toMatchObject({ kind: 'error', error: 'network' })
    expect(view.submit.disabled).toBe(false)
    expect((fetchImpl.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true)
  })

  it('keeps the verdict and drops only the explanation when the stream stalls after it', async () => {
    const s = stalledFetch(frame('verdict', RED))
    const { chat, view } = mount(s.fetchImpl)
    void chat.ask('0x0000000000000000000000000000000000000001')
    await tick(0)
    expect(chat.state).toMatchObject({ kind: 'verdict', streaming: true })
    expect(view.submit.disabled).toBe(true)

    await tick(STALL_MS)
    expect(chat.state).toMatchObject({ kind: 'verdict', streaming: false, llmFailed: true })
    expect(view.panel.dataset.verdict).toBe('red')
    expect(view.submit.disabled).toBe(false)
  })

  it('every event re-arms the timer: a slow but alive stream is not cut', async () => {
    const s = stalledFetch(frame('verdict', RED))
    const { chat } = mount(s.fetchImpl)
    void chat.ask('0x0000000000000000000000000000000000000001')
    await tick(30_000)
    s.send(frame('delta', { text: 'Do not ' }))
    await tick(30_000) // 60 s since the start, 30 s since the last event
    s.send(frame('delta', { text: 'sign.' }))
    await tick(30_000)
    expect(chat.state).toMatchObject({ kind: 'verdict', streaming: true, explanation: 'Do not sign.' })

    await tick(STALL_MS - 30_000)
    expect(chat.state).toMatchObject({ kind: 'verdict', streaming: false, llmFailed: true })
  })

  it('a stream that finishes normally never fires the timer', async () => {
    const s = stalledFetch(frame('verdict', RED) + frame('delta', { text: 'ok' }) + frame('done', {}))
    const { chat, view } = mount(s.fetchImpl)
    void chat.ask('0x0000000000000000000000000000000000000001')
    await tick(0)
    expect(chat.state).toMatchObject({ kind: 'verdict', streaming: false, llmFailed: false, explanation: 'ok' })
    expect(view.submit.disabled).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    await tick(STALL_MS * 2)
    expect(chat.state).toMatchObject({ kind: 'verdict', llmFailed: false })
  })
})
