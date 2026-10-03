import type { Hex } from '../types.js'
import { requestJson, SourceError, type HttpOpts } from './http.js'
import type { SourcifyAbiItem, SourcifyContract } from './raw-types.js'

const SOURCIFY = 'https://sourcify.dev/server/v2/contract/1'

export async function sourcifyGetContract(address: Hex, o: HttpOpts = {}): Promise<SourcifyContract | null> {
  const { status, json } = await requestJson('sourcify', `${SOURCIFY}/${address}?fields=abi,proxyResolution`, { timeoutMs: 6000, ...o })
  if (status === 404) return null // EOA or unverified contract
  if (status !== 200) throw new SourceError('sourcify', 'http', `HTTP ${status}: ${JSON.stringify(json)}`, status)
  return json as SourcifyContract
}

/** ABI to decode calldata sent TO `address`. For proxies: the implementation's ABI first, then its own. */
export async function sourcifyResolvedAbi(
  address: Hex,
  o: HttpOpts = {},
): Promise<{ abi: SourcifyAbiItem[]; implementation: string | null } | null> {
  const c = await sourcifyGetContract(address, o)
  if (!c) return null
  const impl = c.proxyResolution?.isProxy ? (c.proxyResolution.implementations[0]?.address ?? null) : null
  if (!impl) return { abi: c.abi ?? [], implementation: null }
  const ic = await sourcifyGetContract(impl as Hex, o)
  return { abi: [...(ic?.abi ?? []), ...(c.abi ?? [])], implementation: impl }
}
