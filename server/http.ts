const bigintSafe = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers)
  h.set('content-type', 'application/json; charset=utf-8')
  if (!h.has('cache-control')) h.set('cache-control', 'no-store')
  return new Response(JSON.stringify(body, bigintSafe), { status, headers: h })
}

/** JSON response from an already serialized string (the cached verdict). */
export function rawJson(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (!k || k in out) continue
    try {
      out[k] = decodeURIComponent(v)
    } catch {
      out[k] = v
    }
  }
  return out
}

export interface CookieOpts {
  maxAge?: number
  path?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Lax' | 'Strict' | 'None'
}

export function serializeCookie(name: string, value: string, o: CookieOpts = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? '/'}`]
  if (o.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(o.maxAge)}`)
  if (o.httpOnly ?? true) parts.push('HttpOnly')
  if (o.secure ?? true) parts.push('Secure')
  parts.push(`SameSite=${o.sameSite ?? 'Lax'}`)
  return parts.join('; ')
}

/** Client IP: Vercel sets x-real-ip; otherwise, the first hop of x-forwarded-for. */
export function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return '0.0.0.0'
}

/**
 * Host the browser addressed. On Vercel the Host header is the domain the client used (custom domain or preview URL);
 * x-forwarded-host is deliberately not read: outside Vercel's edge a client can send any value.
 */
export function requestHost(req: Request, publicHost?: string): string {
  return (publicHost || req.headers.get('host') || new URL(req.url).host).toLowerCase()
}

/**
 * A browser POST sent from another site (a <form> elsewhere, which needs no CORS preflight): Origin present with a
 * host other than ours (or "null"), or Sec-Fetch-Site cross-site. Requests without those headers (curl, scripts) pass.
 */
export function isCrossSite(req: Request, publicHost?: string): boolean {
  const origin = req.headers.get('origin')
  if (origin) {
    let host: string
    try {
      host = new URL(origin).host.toLowerCase()
    } catch {
      return true // "null" (sandboxed frames, opaque origins) or garbage
    }
    const ours = [publicHost, req.headers.get('host'), new URL(req.url).host].filter((h): h is string => !!h).map((h) => h.toLowerCase())
    return !ours.includes(host)
  }
  return req.headers.get('sec-fetch-site') === 'cross-site'
}

export const SSE_HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
}

const enc = new TextEncoder()
export function sseFrame(event: string, data: unknown): Uint8Array {
  return sseRaw(event, JSON.stringify(data, bigintSafe))
}
/** `data` is already single-line JSON. */
export function sseRaw(event: string, data: string): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${data}\n\n`)
}
