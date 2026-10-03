import { getAddress, isAddress } from 'viem'
import type { Hex, ParsedInput, TypedDataInput } from './types.js'
import { toBigInt } from './util.js'

// LLM-free extractor: JSON (tx or typed data) > tx hash (32 bytes) > address (20 bytes).
const HASH_RE = /(?<![0-9a-zA-Z])0x[0-9a-fA-F]{64}(?![0-9a-zA-Z])/
const ADDR_RE = /(?<![0-9a-zA-Z])0x[0-9a-fA-F]{40}(?![0-9a-zA-Z])/
const HEXDATA_RE = /^0x([0-9a-fA-F]{2})*$/

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isAddr = (v: unknown): v is string => typeof v === 'string' && isAddress(v, { strict: false })

// A JSON object key opening ({"key": or the same inside an escaped string). Used only to recognise a
// malformed or truncated payload, which must fail safe instead of degrading into an address verdict.
const JSON_KEY_RE = /\{\s*\\?"[\w$.\- ]{1,80}\\?"\s*:/
const MAX_JSON_STARTS = 32

/** Index of the bracket that closes the one at `start` (string-aware), or -1 if it never closes. */
function closingIndex(text: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text.charAt(i)
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Every balanced {...} / [...] span of the text that parses as JSON, outermost first. Scanning span by span
 * (not first-bracket to last-bracket) keeps a stray "[" or trailing text from hiding the real payload.
 */
function jsonPayloads(text: string): unknown[] {
  const found: unknown[] = []
  const open = /[[{]/g
  let m = open.exec(text)
  for (let starts = 0; m && starts < MAX_JSON_STARTS; starts++) {
    const end = closingIndex(text, m.index)
    if (end >= 0) {
      // Balanced: one JSON value or one malformed blob; never look inside it.
      try {
        found.push(JSON.parse(text.slice(m.index, end + 1)))
      } catch {
        // not JSON
      }
      open.lastIndex = end + 1
    }
    m = open.exec(text)
  }
  return found
}

/** A wallet request {method, params} carries the real payload in params. */
function unwrapRpc(json: unknown): unknown {
  return isObj(json) && typeof json.method === 'string' && Array.isArray(json.params) ? json.params : json
}

/** True when a parsed payload holds an address or a 32-byte hash somewhere inside it. */
function carriesIdentifier(json: unknown): boolean {
  const s = JSON.stringify(json)
  return HASH_RE.test(s) || ADDR_RE.test(s)
}

function asTypedData(json: unknown): TypedDataInput | null {
  // eth_signTypedData_v4 params: [signer, typedData | "typedData"]
  let v = json
  if (Array.isArray(json) && json.length === 2) {
    v = json[1]
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v)
      } catch {
        return null
      }
    }
  }
  if (!isObj(v)) return null
  const { domain, types, primaryType, message } = v
  if (!isObj(domain) || !isObj(types) || typeof primaryType !== 'string' || !isObj(message)) return null
  for (const fields of Object.values(types)) {
    if (!Array.isArray(fields)) return null
    for (const f of fields) if (!isObj(f) || typeof f.name !== 'string' || typeof f.type !== 'string') return null
  }
  return { domain, types: types as TypedDataInput['types'], primaryType, message }
}

function asTx(input: unknown): Extract<ParsedInput, { kind: 'tx' }>['tx'] | null {
  // eth_sendTransaction params: [tx]
  const json = Array.isArray(input) && input.length === 1 ? input[0] : input
  // A missing or null `to` (contract creation) is not something this extractor evaluates: it fails safe.
  if (!isObj(json) || !isAddr(json.to)) return null
  const rawData = json.data ?? json.input ?? '0x'
  if (typeof rawData !== 'string' || !HEXDATA_RE.test(rawData)) return null
  const value = toBigInt(json.value ?? 0)
  if (value === null) return null
  const tx: Extract<ParsedInput, { kind: 'tx' }>['tx'] = { to: getAddress(json.to), data: rawData.toLowerCase() as Hex, value }
  if (json.from !== undefined) {
    if (!isAddr(json.from)) return null
    tx.from = getAddress(json.from)
  }
  return tx
}

export function parseInput(raw: string): ParsedInput {
  const text = raw.trim()
  const payloads = jsonPayloads(text)
  for (const json of payloads.map(unwrapRpc)) {
    const typedData = asTypedData(json)
    if (typedData) return { kind: 'typedData', typedData }
    const tx = asTx(json)
    if (tx) return { kind: 'tx', tx }
  }
  // Fail safe: a JSON payload that is not a readable tx or typed data (RPC wrapper we do not know, contract
  // creation, odd value, truncated paste) must never become a verdict on an address found inside it, which
  // is usually the user's own signer.
  if (JSON_KEY_RE.test(text) || payloads.some(carriesIdentifier)) return { kind: 'unknown', raw: text.slice(0, 200) }
  const h = HASH_RE.exec(text)
  if (h) return { kind: 'txHash', hash: h[0].toLowerCase() as Hex }
  const a = ADDR_RE.exec(text)
  if (a) return { kind: 'address', address: getAddress(a[0]) }
  return { kind: 'unknown', raw: text.slice(0, 200) }
}
