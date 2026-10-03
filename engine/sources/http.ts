export type SourceId = 'rpc' | 'blockscout' | 'goplus' | 'sourcify' | 'openchain'
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>
export interface HttpOpts {
  fetchImpl?: FetchLike
  timeoutMs?: number
}
export type SourceErrorKind = 'timeout' | 'network' | 'http' | 'rate_limited' | 'bad_response' | 'rpc'

// No parameter properties: erasableSyntaxOnly (and Node 26 strip-only mode) rejects them.
export class SourceError extends Error {
  readonly source: SourceId
  readonly kind: SourceErrorKind
  readonly status: number | undefined
  constructor(source: SourceId, kind: SourceErrorKind, message: string, status?: number) {
    super(`${source}/${kind}: ${message}`)
    this.name = 'SourceError'
    this.source = source
    this.kind = kind
    this.status = status
  }
}

export async function requestJson(
  source: SourceId,
  url: string,
  { fetchImpl = fetch, timeoutMs = 8000, body }: HttpOpts & { body?: unknown } = {},
): Promise<{ status: number; json: unknown }> {
  let res: Response
  let text: string
  try {
    res = await fetchImpl(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs), // also bounds reading the body
    })
    text = await res.text()
  } catch (e) {
    const name = (e as { name?: string } | null)?.name
    const kind: SourceErrorKind = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network'
    throw new SourceError(source, kind, String((e as Error | null)?.message ?? e))
  }
  if (res.status === 429) throw new SourceError(source, 'rate_limited', `HTTP 429 ${url}`, 429)
  try {
    return { status: res.status, json: JSON.parse(text) }
  } catch {
    throw new SourceError(source, 'bad_response', `non-JSON HTTP ${res.status} from ${url}`, res.status)
  }
}
