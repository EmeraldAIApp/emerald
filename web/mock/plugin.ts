// DEVELOPMENT ONLY. Mounts the /api/* mock on the Vite dev server (`vite --mode mock`).
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { createMockApi } from './api.js'

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
    method: req.method,
    headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  })
}

async function send(res: ServerResponse, r: Response): Promise<void> {
  res.statusCode = r.status
  r.headers.forEach((v, k) => res.setHeader(k, v))
  if (!r.body) return void res.end()
  const reader = r.body.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    res.write(value)
  }
  res.end()
}

export function mockApi(): Plugin {
  const api = createMockApi({ delayMs: 40, now: () => new Date() })
  return {
    name: 'emerald-mock-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        toRequest(req)
          .then((request) => api.handle(request))
          .then((r) => (r ? send(res, r) : next()))
          .catch((e: unknown) => {
            res.statusCode = 500
            res.end(String(e))
          })
      })
    },
  }
}
