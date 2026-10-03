import type { Hex, SimCall } from '../types.js'
import { requestJson, SourceError, type HttpOpts } from './http.js'
import type { JsonRpcResponse, RpcTransaction, SimBlockResult, SimCallResult } from './raw-types.js'

export const DEFAULT_RPC = 'https://ethereum-rpc.publicnode.com'
export type RpcOpts = HttpOpts & { url?: string }

export async function rpcRequest<T>(method: string, params: unknown[], { url = DEFAULT_RPC, ...o }: RpcOpts = {}): Promise<T> {
  const { status, json } = await requestJson('rpc', url, { timeoutMs: 8000, ...o, body: { jsonrpc: '2.0', id: 1, method, params } })
  const r = json as JsonRpcResponse<T>
  if (r.error) throw new SourceError('rpc', 'rpc', `${method}: ${r.error.code} ${r.error.message}`, status)
  if (status !== 200 || !('result' in r)) throw new SourceError('rpc', 'http', `${method}: HTTP ${status}`, status)
  return r.result as T
}

export const rpcGetCode = (a: Hex, o?: RpcOpts) => rpcRequest<string>('eth_getCode', [a, 'latest'], o)
export const rpcGetTransactionByHash = (h: Hex, o?: RpcOpts) => rpcRequest<RpcTransaction | null>('eth_getTransactionByHash', [h], o)
export const rpcCall = (to: Hex, data: Hex, o?: RpcOpts) => rpcRequest<Hex>('eth_call', [{ to, data }, 'latest'], o)

/** EOA delegated with EIP-7702: the code is exactly 0xef0100 ++ the delegate's 20 bytes. */
export function parseCode(code: string): { kind: 'eoa' } | { kind: 'eip7702'; delegate: Hex } | { kind: 'contract' } {
  const c = code.toLowerCase()
  if (c === '0x' || c === '0x0') return { kind: 'eoa' }
  if (c.length === 48 && c.startsWith('0xef0100')) return { kind: 'eip7702', delegate: `0x${c.slice(8)}` }
  return { kind: 'contract' }
}

/** eth_simulateV1 + traceTransfers. If ETH for `value` is missing the error is TOP-LEVEL (-38014): pass balanceOverride. */
export async function rpcSimulate(call: SimCall, { balanceOverride, ...o }: RpcOpts & { balanceOverride?: bigint } = {}): Promise<SimCallResult> {
  const block: Record<string, unknown> = {
    calls: [{ from: call.from, to: call.to, data: call.data, value: `0x${call.value.toString(16)}` }],
  }
  if (balanceOverride !== undefined) block.stateOverrides = { [call.from]: { balance: `0x${balanceOverride.toString(16)}` } }
  const blocks = await rpcRequest<SimBlockResult[]>(
    'eth_simulateV1',
    [{ blockStateCalls: [block], traceTransfers: true, validation: false }, 'latest'],
    { timeoutMs: 10000, ...o },
  )
  const res = blocks[0]?.calls[0]
  if (!res) throw new SourceError('rpc', 'bad_response', 'eth_simulateV1: empty result')
  return res
}
