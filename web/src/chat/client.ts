// POST /api/chat client: fetch + reading the SSE stream (EventSource will not do: it is GET only).
import { SseParser } from './sse.js'
import { isObj, isUsage, isWireVerdict, type ChatErrorCode, type Usage, type WireVerdict } from './wire.js'

export type ClientEvent =
  | { type: 'verdict'; verdict: WireVerdict }
  | { type: 'delta'; text: string }
  | { type: 'done'; usage: Usage | null }
  | { type: 'error'; code: ChatErrorCode; message: string }
  | { type: 'http'; status: number; body: unknown }
  | { type: 'network'; message: string }
  | { type: 'end' }

export interface ChatRequest { input: string; userAddress?: string }

const ERROR_CODES = new Set<string>(['quota', 'paused', 'llm', 'bad_input'])

export function frameToEvent(event: string, data: string): ClientEvent | null {
  let json: unknown
  try {
    json = JSON.parse(data)
  } catch {
    return null
  }
  const o = isObj(json) ? json : {}
  switch (event) {
    case 'verdict':
      return isWireVerdict(json) ? { type: 'verdict', verdict: json } : null
    case 'delta':
      return typeof o.text === 'string' ? { type: 'delta', text: o.text } : null
    case 'done':
      return { type: 'done', usage: isUsage(o.usage) ? o.usage : null }
    case 'error': {
      const code = typeof o.code === 'string' && ERROR_CODES.has(o.code) ? (o.code as ChatErrorCode) : 'llm'
      return { type: 'error', code, message: typeof o.message === 'string' ? o.message : '' }
    }
    default:
      return null
  }
}

export async function streamChat(
  req: ChatRequest,
  onEvent: (e: ClientEvent) => void,
  opts: { fetchImpl?: typeof fetch; signal?: AbortSignal; url?: string } = {},
): Promise<void> {
  const f = opts.fetchImpl ?? fetch
  const emitFrames = (frames: { event: string; data: string }[]) => {
    for (const fr of frames) {
      const ev = frameToEvent(fr.event, fr.data)
      if (ev) onEvent(ev)
    }
  }
  let res: Response
  try {
    res = await f(opts.url ?? '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(req),
      credentials: 'same-origin',
      signal: opts.signal,
    })
  } catch (e) {
    if (!opts.signal?.aborted) onEvent({ type: 'network', message: e instanceof Error ? e.message : String(e) })
    return
  }
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.includes('text/event-stream') || !res.body) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    onEvent({ type: 'http', status: res.status, body })
    return
  }
  const parser = new SseParser()
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      emitFrames(parser.push(value))
    }
    emitFrames(parser.flush())
    onEvent({ type: 'end' })
  } catch (e) {
    if (!opts.signal?.aborted) onEvent({ type: 'network', message: e instanceof Error ? e.message : String(e) })
  }
}
