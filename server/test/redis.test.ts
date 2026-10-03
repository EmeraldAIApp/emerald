import { Redis } from '@upstash/redis'
import { describe, expect, it, vi } from 'vitest'
import { MemoryStore, upstashStore } from '../redis.js'

/** Upstash REST emulated with a fake fetch (no network). */
function fakeUpstash() {
  const data = new Map<string, string | number>()
  const calls: { url: string; body: unknown }[] = []
  const exec = (cmd: (string | number)[]): unknown => {
    const [op, key, arg] = cmd as [string, string, string | number | undefined]
    switch (op.toUpperCase()) {
      case 'INCR':
        data.set(key, Number(data.get(key) ?? 0) + 1)
        return data.get(key)
      case 'INCRBYFLOAT':
        data.set(key, Number(data.get(key) ?? 0) + Number(arg))
        return String(data.get(key))
      case 'EXPIREAT':
        return 1
      case 'GET':
        return data.has(key) ? String(data.get(key)) : null
      case 'SET':
        data.set(key, String(arg))
        return 'OK'
      case 'DEL':
        return data.delete(key) ? 1 : 0
      default:
        throw new Error(`unsupported ${op}`)
    }
  }
  const enc = (v: unknown) => (typeof v === 'string' ? Buffer.from(v).toString('base64') : v)
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    const body = JSON.parse(String(init?.body)) as unknown
    calls.push({ url, body })
    const b64 = new Headers(init?.headers).get('upstash-encoding') === 'base64'
    const wrap = (v: unknown) => ({ result: b64 ? enc(v) : v })
    const out = url.endsWith('/multi-exec') || url.endsWith('/pipeline')
      ? (body as (string | number)[][]).map((c) => wrap(exec(c)))
      : wrap(exec(body as (string | number)[]))
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return { fetchMock, calls }
}

describe('upstashStore (wire format, no network)', () => {
  it('incrExpireAt = one POST /multi-exec with INCR + EXPIREAT; floats, json and del work', async () => {
    const { fetchMock, calls } = fakeUpstash()
    vi.stubGlobal('fetch', fetchMock)
    const store = upstashStore(new Redis({ url: 'https://fake.upstash.io', token: 't', enableTelemetry: false }))
    expect(await store.incrExpireAt('em:q:anon:ip:20260930', 1759284000)).toBe(1)
    expect(await store.incrExpireAt('em:q:anon:ip:20260930', 1759284000)).toBe(2)
    expect(calls[0]!.url).toBe('https://fake.upstash.io/multi-exec')
    expect(calls[0]!.body).toEqual([['incr', 'em:q:anon:ip:20260930'], ['expireat', 'em:q:anon:ip:20260930', 1759284000]])
    expect(await store.incrFloatExpireAt('em:spend:20260930', 0.0125, 1759284000)).toBeCloseTo(0.0125)
    expect(await store.getNumber('em:spend:20260930')).toBeCloseTo(0.0125)
    expect(await store.getNumber('missing')).toBe(0)
    await store.setJson('em:v:abc', { level: 'red' }, 600)
    expect(await store.getJson('em:v:abc')).toEqual({ level: 'red' })
    expect(await store.del('em:v:abc')).toBe(1)
    expect(await store.del('em:v:abc')).toBe(0)
  })
})

describe('MemoryStore', () => {
  it('expires keys and supports single-use del', async () => {
    let now = Date.parse('2026-09-30T20:00:00Z')
    const s = new MemoryStore(() => now)
    await s.setJson('k', 'v', 10)
    expect(await s.getJson('k')).toBe('v')
    now += 11_000
    expect(await s.getJson('k')).toBeNull()
    await s.setJson('n', 1, 300)
    expect(await s.del('n')).toBe(1)
    expect(await s.del('n')).toBe(0)
  })
})
