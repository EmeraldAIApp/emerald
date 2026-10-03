import type { FetchLike } from '../../engine/sources/http.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * fetch for scripts against mainnet: spaces out GoPlus calls (without a key: ~10 in a row and then
 * {code:4029} with HTTP 200) and retries 4029 / HTTP 429 after waiting. Do NOT use in production.
 */
export function politeFetch(base: FetchLike = fetch, { goplusGapMs = 7000, retryWaitMs = 30000, maxRetries = 8, log = (_: string) => {} } = {}): FetchLike {
  let nextGoplus = 0
  return async (url, init) => {
    const isGoplus = url.includes('gopluslabs.io')
    // Waiting must not eat the engine timeout: its signal is ignored and each attempt carries its own.
    const { signal: _callerSignal, ...rest } = init ?? {}
    for (let attempt = 0; ; attempt++) {
      if (isGoplus) {
        const wait = nextGoplus - Date.now()
        nextGoplus = Math.max(Date.now(), nextGoplus) + goplusGapMs
        if (wait > 0) await sleep(wait)
      }
      const res = await base(url, { ...rest, signal: AbortSignal.timeout(20000) })
      const text = await res.text()
      const limited = res.status === 429 || (isGoplus && text.includes('"code":4029'))
      if (limited && attempt < maxRetries) {
        log(`rate limited (${attempt + 1}/${maxRetries}), waiting ${retryWaitMs} ms: ${url.slice(0, 90)}`)
        await sleep(retryWaitMs)
        continue
      }
      return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } })
    }
  }
}

/** true if the RPC answers (the scripts skip without network). */
export async function hasNetwork(rpcUrl: string): Promise<boolean> {
  try {
    const r = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(8000),
    })
    return r.ok
  } catch {
    return false
  }
}
