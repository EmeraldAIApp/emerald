import { createPublicClient, http, isAddressEqual, isErc6492Signature, recoverMessageAddress, type PublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { createSiweMessage, generateSiweNonce, parseSiweMessage, validateSiweMessage, verifySiweMessage } from 'viem/siwe'
import type { Hex } from '../engine/types.js'

export { generateSiweNonce }

export function mainnetClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: mainnet, transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }) })
}

/** Message the front end signs (kept here to pin the exact field set and use it in tests). */
export function buildMessage(p: { address: Hex; domain: string; uri: string; nonce: string; now?: Date }): string {
  const now = p.now ?? new Date()
  return createSiweMessage({
    address: p.address,
    chainId: 1,
    domain: p.domain,
    nonce: p.nonce,
    uri: p.uri,
    version: '1',
    statement: 'Sign in to Emerald. This does not cost gas or move funds.',
    issuedAt: now,
    expirationTime: new Date(now.getTime() + 5 * 60_000),
  })
}

export type VerifyOutcome = { ok: true; address: Hex; via: 'eoa' | 'erc1271/6492' } | { ok: false; reason: string }

/**
 * EOA: local recovery (no RPC). Smart accounts: ERC-1271/6492 via eth_call.
 * verifySiweMessage returns false (does not throw) if the RPC is down, so getCode is probed first.
 */
export async function verifyLogin(
  client: PublicClient,
  p: { message: string; signature: Hex; domain: string; nonce: string; now?: Date },
): Promise<VerifyOutcome> {
  const parsed = parseSiweMessage(p.message)
  if (!parsed.address) return { ok: false, reason: 'no_address' }
  if (parsed.chainId !== 1) return { ok: false, reason: 'chain' }
  const time = p.now ?? new Date()
  if (!validateSiweMessage({ message: parsed, domain: p.domain, nonce: p.nonce, time })) return { ok: false, reason: 'invalid_fields' }
  try {
    const rec = await recoverMessageAddress({ message: p.message, signature: p.signature })
    if (isAddressEqual(rec, parsed.address)) return { ok: true, address: parsed.address, via: 'eoa' }
  } catch {
    // not an EOA ECDSA signature: try smart account
  }
  let code: Hex | undefined
  try {
    code = await client.getCode({ address: parsed.address })
  } catch {
    return { ok: false, reason: 'rpc_error' }
  }
  if ((!code || code === '0x') && !isErc6492Signature(p.signature)) return { ok: false, reason: 'bad_signature' }
  try {
    const ok = await verifySiweMessage(client, { message: p.message, signature: p.signature, domain: p.domain, nonce: p.nonce, time })
    return ok ? { ok: true, address: parsed.address, via: 'erc1271/6492' } : { ok: false, reason: 'bad_signature' }
  } catch {
    return { ok: false, reason: 'rpc_error' }
  }
}
