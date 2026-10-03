import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FetchLike } from '../../sources/http.js'

export const RAW_DIR = fileURLToPath(new URL('../fixtures/raw/', import.meta.url))

interface ManifestEntry {
  method: string
  url: string
  requestBody?: unknown
  status: number
  recordedAt: string
}
export const manifest = JSON.parse(readFileSync(RAW_DIR + '_manifest.json', 'utf8')) as Record<string, ManifestEntry>

/** Parsed content of engine/test/fixtures/raw/<name>.json */
export function raw<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(RAW_DIR + name + '.json', 'utf8')) as T
}

function respond(name: string): Response {
  const e = manifest[name]
  if (!e) throw new Error(`no fixture ${name}`)
  return new Response(readFileSync(RAW_DIR + name + '.json', 'utf8'), {
    status: e.status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Every request returns the same fixture (useful for RPC: every POST goes to the same URL). */
export const fixed =
  (name: string): FetchLike =>
  async () =>
    respond(name)

/** Resolves each GET by the URL recorded in the manifest (case-insensitive). Records the requested URLs. */
export function byUrl(calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url)
    const hit = Object.entries(manifest).find(([, e]) => e.method === 'GET' && e.url.toLowerCase() === url.toLowerCase())
    if (!hit) throw new Error(`unmatched ${url}`)
    return respond(hit[0])
  }
}
