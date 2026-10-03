// Sign-In with Ethereum ONLY for the quota: it signs a MESSAGE (personal_sign), never a transaction.
import { createWalletClient, custom, type EIP1193Provider } from 'viem'
import { mainnet } from 'viem/chains'
import { createSiweMessage } from 'viem/siwe'
import { isSignInResult, type SignInResult } from '../chat/wire.js'

export const SIWE_STATEMENT = 'Sign in to Emerald. This does not cost gas or move funds.'

export type SignInFailure = 'no_wallet' | 'no_account' | 'rejected' | 'nonce' | 'verify'

export class SignInError extends Error {
  readonly reason: SignInFailure
  constructor(reason: SignInFailure, message: string = reason) {
    super(message)
    this.name = 'SignInError'
    this.reason = reason
  }
}

export function injectedProvider(): EIP1193Provider | null {
  const eth = (globalThis as { ethereum?: EIP1193Provider }).ethereum
  return eth && typeof eth.request === 'function' ? eth : null
}

export async function signIn(
  provider: EIP1193Provider | null,
  opts: { host: string; origin: string; fetchImpl?: typeof fetch; now?: Date },
): Promise<SignInResult> {
  if (!provider) throw new SignInError('no_wallet')
  const f = opts.fetchImpl ?? fetch
  const wallet = createWalletClient({ chain: mainnet, transport: custom(provider) })
  let address: `0x${string}` | undefined
  try {
    ;[address] = await wallet.requestAddresses()
  } catch {
    throw new SignInError('rejected')
  }
  if (!address) throw new SignInError('no_account')

  const nr = await f('/api/auth/nonce', { credentials: 'same-origin' })
  const nonceBody = (await nr.json().catch(() => null)) as { nonce?: unknown } | null
  if (!nr.ok || typeof nonceBody?.nonce !== 'string') throw new SignInError('nonce')

  const now = opts.now ?? new Date()
  const message = createSiweMessage({
    address,
    chainId: 1,
    domain: opts.host,
    nonce: nonceBody.nonce,
    uri: opts.origin,
    version: '1',
    statement: SIWE_STATEMENT,
    issuedAt: now,
    expirationTime: new Date(now.getTime() + 5 * 60_000),
  })
  let signature: `0x${string}`
  try {
    signature = await wallet.signMessage({ account: address, message })
  } catch {
    throw new SignInError('rejected')
  }

  const vr = await f('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ message, signature }),
  })
  const body = (await vr.json().catch(() => null)) as unknown
  if (!vr.ok || !isSignInResult(body)) {
    const err = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : 'verify'
    throw new SignInError('verify', err)
  }
  return body
}
