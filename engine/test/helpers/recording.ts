import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FetchLike } from '../../sources/http.js'

export const RECORDINGS_DIR = fileURLToPath(new URL('../fixtures/recordings/', import.meta.url))
export const CASES_DIR = fileURLToPath(new URL('../fixtures/cases/', import.meta.url))

export interface RealCase {
  name: string
  input: string
  userAddress?: `0x${string}`
  expectedLevel: 'green' | 'yellow' | 'red'
  expectedReasonCodes: string[]
  why: string
  sources: string[]
}
export interface Recording {
  case: string
  recordedAt: string
  entries: Record<string, { status: number; body: unknown }>
}

/** Every real case verified on 2026-09-30 uses this "now" (contract age). */
export const CASES_NOW = new Date('2026-09-30T20:00:00Z')

/** JSON with sorted keys: the same request yields the same key even if the property order changes. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

export function requestKey(url: string, init?: RequestInit): string {
  const method = init?.method ?? 'GET'
  const body = init?.body === undefined || init.body === null ? '' : ` ${canonicalJson(JSON.parse(String(init.body)))}`
  return `${method} ${url}${body}`
}

/** Wraps a fetch and stores each response in `rec` (the body as JSON when possible). */
export function recordingFetch(inner: FetchLike, rec: Recording): FetchLike {
  return async (url, init) => {
    const res = await inner(url, init)
    const text = await res.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    rec.entries[requestKey(url, init)] = { status: res.status, body }
    return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } })
  }
}

/** Replays a recording. An unrecorded request fails like a network outage (the case turns yellow and the test shows it). */
export function replayFetch(rec: Recording): FetchLike {
  return async (url, init) => {
    const e = rec.entries[requestKey(url, init)]
    if (!e) throw new Error(`unrecorded request: ${requestKey(url, init).slice(0, 300)}`)
    return new Response(typeof e.body === 'string' ? e.body : JSON.stringify(e.body), { status: e.status, headers: { 'content-type': 'application/json' } })
  }
}

export function loadCase(name: string): RealCase {
  return JSON.parse(readFileSync(`${CASES_DIR}${name}.json`, 'utf8')) as RealCase
}

export function loadRecording(name: string): Recording | null {
  const p = `${RECORDINGS_DIR}${name}.json`
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Recording) : null
}
