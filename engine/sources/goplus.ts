import type { Hex } from '../types.js'
import { requestJson, SourceError, type HttpOpts } from './http.js'
import type { GoPlusAddressSecurity, GoPlusEnvelope, GoPlusTokenSecurity } from './raw-types.js'

const GOPLUS = 'https://api.gopluslabs.io/api/v1'

function unwrap<T>(json: unknown): T {
  const env = json as GoPlusEnvelope<T>
  if (env.code === 4029) throw new SourceError('goplus', 'rate_limited', env.message) // arrives as HTTP 200
  if ((env.code !== 1 && env.code !== 2) || env.result === undefined) {
    throw new SourceError('goplus', 'bad_response', `code ${env.code}: ${env.message}`)
  }
  return env.result
}

export async function goplusAddressSecurity(address: Hex, o: HttpOpts = {}): Promise<GoPlusAddressSecurity> {
  const { json } = await requestJson('goplus', `${GOPLUS}/address_security/${address}?chain_id=1`, o)
  return unwrap<GoPlusAddressSecurity>(json)
}

/** Without a key GoPlus only answers the FIRST address: one per request. */
export async function goplusTokenSecurity(address: Hex, o: HttpOpts = {}): Promise<GoPlusTokenSecurity | null> {
  const { json } = await requestJson('goplus', `${GOPLUS}/token_security/1?contract_addresses=${address}`, o)
  return unwrap<Record<string, GoPlusTokenSecurity>>(json)[address.toLowerCase()] ?? null
}
