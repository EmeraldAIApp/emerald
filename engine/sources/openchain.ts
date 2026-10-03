import type { Hex } from '../types.js'
import { requestJson, SourceError, type HttpOpts } from './http.js'
import type { OpenchainLookup, OpenchainSig } from './raw-types.js'

const OPENCHAIN = 'https://api.openchain.xyz/signature-database/v1/lookup'

/** Selectors ALWAYS go lowercase: in uppercase the filter is not applied and the key changes. */
export async function openchainLookupFunctions(selectors: Hex[], o: HttpOpts = {}): Promise<Record<string, OpenchainSig[] | null>> {
  const sel = [...new Set(selectors.map((s) => s.toLowerCase()))]
  const { json } = await requestJson('openchain', `${OPENCHAIN}?function=${sel.join(',')}&filter=true`, { timeoutMs: 5000, ...o })
  const j = json as OpenchainLookup
  if (!j.ok || !j.result) throw new SourceError('openchain', 'bad_response', j.error ?? 'ok=false')
  return j.result.function
}
