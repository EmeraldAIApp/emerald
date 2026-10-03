import { getAddress, isAddress } from 'viem'
import { parseInput } from '../../engine/parse.js'
import type { Hex } from '../../engine/types.js'

export const MAX_INPUT_CHARS = 20_000

/** Body of /api/check and /api/chat: {input, userAddress?}. null = bad_input (includes inputs the extractor does not recognize). */
export async function readCheckBody(req: Request): Promise<{ input: string; userAddress?: Hex } | null> {
  // Only application/json: a cross-site <form enctype="text/plain"> can forge a JSON-looking body without a CORS preflight.
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return null
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return null
  }
  // Valid JSON that is not an object (null, 123, "x", []) is bad_input too: reading `.input` of null would throw (a 500).
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const body = raw as { input?: unknown; userAddress?: unknown }
  if (typeof body.input !== 'string' || body.input.trim().length === 0 || body.input.length > MAX_INPUT_CHARS) return null
  if (parseInput(body.input).kind === 'unknown') return null
  if (body.userAddress === undefined || body.userAddress === null || body.userAddress === '') return { input: body.input }
  if (typeof body.userAddress !== 'string' || !isAddress(body.userAddress, { strict: false })) return null
  return { input: body.input, userAddress: getAddress(body.userAddress) }
}
