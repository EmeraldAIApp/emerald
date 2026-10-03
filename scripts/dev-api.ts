// Local /api/* server with the same handlers as Vercel (Node http <-> web Request/Response).
// Usage: npx tsx scripts/dev-api.ts   (reads .env if present; port 8787; Vite proxies /api)
import { existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { liveDeps } from '../server/deps.js'
import { makeNonceHandler, makeVerifyHandler } from '../server/handlers/auth.js'
import { makeChatHandler } from '../server/handlers/chat.js'
import { makeCheckHandler } from '../server/handlers/check.js'
import { makeComputeHandler } from '../server/handlers/compute.js'
import { makeQuotaHandler } from '../server/handlers/quota.js'
import { mainnetClient } from '../server/siwe.js'

if (existsSync('.env')) process.loadEnvFile('.env')
const PORT = Number(process.env.PORT || 8787)
const HOST = '127.0.0.1'

const routes: Record<string, (req: Request) => Promise<Response>> = {
  '/api/check': makeCheckHandler(liveDeps),
  '/api/chat': makeChatHandler(liveDeps),
  '/api/quota': makeQuotaHandler(liveDeps),
  '/api/compute': makeComputeHandler(liveDeps),
  '/api/auth/nonce': makeNonceHandler(liveDeps),
  '/api/auth/verify': makeVerifyHandler(liveDeps, () => mainnetClient(liveDeps().env.RPC_URL)),
}

// Methods the web Request constructor accepts (it throws on TRACE, CONNECT and TRACK).
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

function reply(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(body)
}

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let url: URL
  try {
    url = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${PORT}`}`)
  } catch {
    reply(res, 400, '{"error":"bad_request"}') // malformed Host header or request target
    return
  }
  const handler = routes[url.pathname]
  if (!handler) {
    reply(res, 404, '{"error":"not_found"}')
    return
  }
  const method = req.method ?? 'GET'
  if (!METHODS.has(method)) {
    reply(res, 405, '{"error":"method"}')
    return
  }
  let request: Request
  try {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    // Like Vercel's edge, the client IP comes from the socket: a client-sent x-real-ip / x-forwarded-for would let
    // anyone pick their own anonymous quota key.
    headers.set('x-real-ip', req.socket.remoteAddress ?? '127.0.0.1')
    headers.delete('x-forwarded-for')
    const hasBody = method !== 'GET' && method !== 'HEAD'
    request = new Request(url, {
      method,
      headers,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
      duplex: 'half',
    } as RequestInit)
  } catch (e) {
    console.error('[emerald] dev-api bad request', e)
    reply(res, 400, '{"error":"bad_request"}')
    return
  }
  const response = await handler(request)
  const out: Record<string, string | string[]> = {}
  response.headers.forEach((v, k) => {
    if (k !== 'set-cookie') out[k] = v
  })
  const cookies = response.headers.getSetCookie()
  if (cookies.length) out['set-cookie'] = cookies
  res.writeHead(response.status, out)
  if (!response.body) return void res.end()
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk)
  res.end()
}

// Like Vercel, a failure in one request must never take the process down: it becomes a 500 for that request
// (or, if the response already started streaming, the connection is cut). Loopback only: with a real .env
// (Anthropic key, Upstash) anyone on the LAN could otherwise spend the budget.
createServer(async (req, res) => {
  try {
    await serve(req, res)
  } catch (e) {
    console.error('[emerald] dev-api', e)
    if (res.headersSent) res.destroy()
    else reply(res, 500, '{"error":"internal"}')
  }
}).listen(PORT, HOST, () => console.log(`emerald api on http://${HOST}:${PORT}`))
