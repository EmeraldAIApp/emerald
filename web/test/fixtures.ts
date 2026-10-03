import type { WireVerdict } from '../src/chat/wire.js'

// Minimal verdicts for tests (contract shape; not real engine output).
export const RED: WireVerdict = {
  level: 'red',
  headline: "Don't sign.",
  reasons: [
    {
      code: 'PERMIT2_UNKNOWN_SPENDER',
      check: 'decode',
      severity: 'danger',
      text: 'Permit2 lets 0x00001f78189bE22C3498cFF1B8e02272C3220000 move your USDC.',
      evidenceUrl: 'https://eth.blockscout.com/address/0x00001f78189bE22C3498cFF1B8e02272C3220000',
    },
    { code: 'LABEL_FLAGGED_BLOCKSCOUT', check: 'labels', severity: 'danger', text: 'Blockscout marks it as a scam.' },
    { code: 'TOKEN_OK', check: 'token', severity: 'ok', text: 'USDC is verified.' },
  ],
  checksOk: ['decode', 'poisoning', 'labels', 'token'],
  checksFailed: [],
  input: {
    kind: 'typedData',
    typedData: {
      domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
      types: { PermitBatch: [{ name: 'spender', type: 'address' }] },
      primaryType: 'PermitBatch',
      message: { spender: '0x00001f78189bE22C3498cFF1B8e02272C3220000' },
    },
  },
  chainId: 1,
  engineVersion: 'test',
}

export const YELLOW_FAILED: WireVerdict = {
  level: 'yellow',
  headline: 'Check before you sign.',
  reasons: [{ code: 'SOURCE_FAILED', check: 'simulate', severity: 'warn', text: 'The simulation source did not answer.' }],
  checksOk: ['decode', 'labels'],
  checksFailed: ['simulate', 'poisoning'],
  input: { kind: 'tx', tx: { from: '0x1E227979f0b5BC691a70DEAed2e0F39a6F538FD5', to: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', data: '0xa9059cbb', value: '0' } },
  chainId: 1,
  engineVersion: 'test',
}

/** Builds an SSE Response from raw chunks (to test arbitrary cuts). */
export function sseResponse(chunks: string[], init: ResponseInit = {}): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' }, ...init })
}

export const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
