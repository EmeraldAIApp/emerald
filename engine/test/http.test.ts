import { describe, expect, it } from 'vitest'
import { requestJson, SourceError, type FetchLike } from '../sources/http.js'

describe('requestJson', () => {
  it('parses JSON and keeps the status', async () => {
    const f: FetchLike = async () => new Response('{"a":1}', { status: 404 })
    expect(await requestJson('sourcify', 'https://x.test', { fetchImpl: f })).toEqual({ status: 404, json: { a: 1 } })
  })

  it('sends POST with a JSON body', async () => {
    let seen: RequestInit | undefined
    const f: FetchLike = async (_url, init) => {
      seen = init
      return new Response('{"ok":true}')
    }
    await requestJson('rpc', 'https://rpc.test', { fetchImpl: f, body: { id: 1 } })
    expect(seen?.method).toBe('POST')
    expect(seen?.body).toBe('{"id":1}')
  })

  it('maps a timeout to kind "timeout"', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
    const err = await requestJson('blockscout', 'https://slow.test', { fetchImpl: hang, timeoutMs: 20 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SourceError)
    expect((err as SourceError).kind).toBe('timeout')
    expect((err as SourceError).source).toBe('blockscout')
  })

  it('maps HTTP 429 to rate_limited and non-JSON to bad_response', async () => {
    const r429: FetchLike = async () => new Response('slow down', { status: 429 })
    const html: FetchLike = async () => new Response('<html>', { status: 502 })
    await expect(requestJson('goplus', 'https://g.test', { fetchImpl: r429 })).rejects.toMatchObject({ kind: 'rate_limited' })
    await expect(requestJson('goplus', 'https://g.test', { fetchImpl: html })).rejects.toMatchObject({ kind: 'bad_response', status: 502 })
  })

  it('maps a thrown fetch to kind "network"', async () => {
    const boom: FetchLike = async () => {
      throw new TypeError('fetch failed')
    }
    await expect(requestJson('openchain', 'https://o.test', { fetchImpl: boom })).rejects.toMatchObject({ kind: 'network' })
  })
})
