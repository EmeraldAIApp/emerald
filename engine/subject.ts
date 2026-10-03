import { NATIVE_ETH } from './known.js'
import type { BlockscoutTransaction } from './sources/raw-types.js'
import type { Hex, Movement, ParsedInput, Sources, Subject } from './types.js'
import { lower, reason, txUrl } from './util.js'

/** Real effects of a mined tx according to Blockscout: native value + token_transfers (ERC-20 / ERC-721). */
export function executedMovements(t: BlockscoutTransaction): Movement[] {
  const out: Movement[] = []
  const value = BigInt(t.value || '0')
  if (value > 0n && t.to) {
    out.push({ kind: 'transfer', asset: NATIVE_ETH, standard: 'native', from: lower(t.from.hash), to: lower(t.to.hash), amount: value })
  }
  for (const x of t.token_transfers ?? []) {
    const standard = x.token_type === 'ERC-721' ? 'erc721' : x.token_type === 'ERC-20' ? 'erc20' : null
    if (!standard) continue
    const amount = standard === 'erc721' ? 1n : BigInt(x.total.value ?? '0')
    out.push({ kind: 'transfer', asset: lower(x.token.address_hash), standard, from: lower(x.from.hash), to: lower(x.to.hash), amount })
  }
  return out
}

/** Turns the input into what gets analyzed. A txHash is looked up in Blockscout (and in the RPC if Blockscout does not have it). */
export async function resolveSubject(parsed: Exclude<ParsedInput, { kind: 'unknown' }>, sources: Sources): Promise<Subject> {
  switch (parsed.kind) {
    case 'tx':
      return {
        kind: 'tx',
        tx: { from: parsed.tx.from ? lower(parsed.tx.from) : null, to: lower(parsed.tx.to), data: parsed.tx.data, value: parsed.tx.value },
        executed: null,
      }
    case 'typedData':
      return { kind: 'typedData', typedData: parsed.typedData }
    case 'address':
      return { kind: 'address', address: lower(parsed.address) }
    case 'txHash':
      return resolveTxHash(parsed.hash, sources)
  }
}

async function resolveTxHash(hash: Hex, sources: Sources): Promise<Subject> {
  let bsFailed = false
  try {
    const t = await sources.blockscout.getTransaction(hash)
    if (t) {
      if (!t.to) {
        return { kind: 'unsupported', failed: false, reason: reason('decode', 'TX_CONTRACT_CREATION', 'warn', 'This transaction deploys a contract; Emerald does not analyze deployments.', txUrl(hash)) }
      }
      return {
        kind: 'tx',
        tx: { from: lower(t.from.hash), to: lower(t.to.hash), data: (t.raw_input || '0x').toLowerCase() as Hex, value: BigInt(t.value || '0') },
        executed: { hash, status: t.status === 'ok' ? 'success' : 'reverted', movements: executedMovements(t) },
      }
    }
  } catch {
    bsFailed = true
  }
  try {
    const r = await sources.rpc.getTransactionByHash(hash)
    if (r && r.to) {
      // Blockscout does not have it (pending or not indexed): analyze it as an unsigned tx.
      return { kind: 'tx', tx: { from: lower(r.from), to: lower(r.to), data: r.input.toLowerCase() as Hex, value: BigInt(r.value) }, executed: null }
    }
    if (r && !r.to) {
      return { kind: 'unsupported', failed: false, reason: reason('decode', 'TX_CONTRACT_CREATION', 'warn', 'This transaction deploys a contract; Emerald does not analyze deployments.', txUrl(hash)) }
    }
  } catch {
    return { kind: 'unsupported', failed: true, reason: reason('decode', 'SOURCE_FAILED', 'warn', 'I could not look up this transaction hash: the data sources did not answer.') }
  }
  if (bsFailed) {
    return { kind: 'unsupported', failed: true, reason: reason('decode', 'SOURCE_FAILED', 'warn', 'I could not look up this transaction hash: Blockscout did not answer.') }
  }
  return { kind: 'unsupported', failed: false, reason: reason('decode', 'TX_NOT_FOUND', 'warn', 'I could not find this transaction hash on Ethereum mainnet.') }
}
