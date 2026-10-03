export interface Captured {
  url: string
  headers: Headers
  body: Record<string, unknown>
}

/** Fake fetch that emits the real Messages API SSE. Passed as `fetch` to the Anthropic client. */
export function fakeAnthropicFetch(opts: {
  texts: string[]
  usage: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; output_tokens: number }
  stopReason?: 'end_turn' | 'refusal' | 'max_tokens'
  model?: string
  delayMs?: number
  captured: Captured[]
}): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    opts.captured.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> })
    const model = opts.model ?? 'claude-opus-5'
    const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
    const frames = [
      ev('message_start', {
        type: 'message_start',
        message: { id: 'msg_fake', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { ...opts.usage, output_tokens: 1 } },
      }),
      ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      ...opts.texts.map((t) => ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
      ev('content_block_stop', { type: 'content_block_stop', index: 0 }),
      ev('message_delta', { type: 'message_delta', delta: { stop_reason: opts.stopReason ?? 'end_turn', stop_sequence: null }, usage: { output_tokens: opts.usage.output_tokens } }),
      ev('message_stop', { type: 'message_stop' }),
    ]
    const enc = new TextEncoder()
    const delay = opts.delayMs ?? 0
    const signal = init?.signal ?? undefined
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        // Like a real fetch, aborting the request signal errors the body right away.
        if (delay) {
          await new Promise<void>((r) => {
            const t = setTimeout(r, delay)
            signal?.addEventListener('abort', () => (clearTimeout(t), r()), { once: true })
          })
        }
        if (signal?.aborted) return c.error(signal.reason ?? new Error('aborted'))
        for (const f of frames) c.enqueue(enc.encode(f))
        c.close()
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_fake' } })
  }) as typeof fetch
}
