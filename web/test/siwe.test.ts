import { recoverMessageAddress, type EIP1193Provider, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { parseSiweMessage } from 'viem/siwe'
import { describe, expect, it, vi } from 'vitest'
import { SIWE_STATEMENT, signIn, SignInError } from '../src/auth/siwe.js'

function fakeWallet(opts: { reject?: boolean } = {}) {
  const account = privateKeyToAccount(generatePrivateKey())
  const methods: string[] = []
  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      methods.push(method)
      if (method === 'eth_requestAccounts') return [account.address]
      if (method === 'personal_sign') {
        if (opts.reject) throw Object.assign(new Error('User rejected'), { code: 4001 })
        const [data] = params as [Hex, Hex]
        return account.signMessage({ message: { raw: data } })
      }
      throw new Error(`unexpected ${method}`)
    },
  } as unknown as EIP1193Provider
  return { account, provider, methods }
}

function fakeApi() {
  const sent: { url: string; body?: unknown }[] = []
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url === '/api/auth/nonce') return Response.json({ nonce: 'n0nce12345678' })
    if (url === '/api/auth/verify') {
      const { message } = JSON.parse(String(init?.body)) as { message: string }
      return Response.json({ address: parseSiweMessage(message).address, tier: 'holder', limit: 100 })
    }
    return new Response('nope', { status: 404 })
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, sent }
}

const where = { host: 'emerald.test', origin: 'https://emerald.test', now: new Date('2026-09-30T20:00:00Z') }

describe('signIn (SIWE for quota)', () => {
  it('asks for accounts, signs a SIWE message (never a transaction) and posts it', async () => {
    const w = fakeWallet()
    const api = fakeApi()
    const r = await signIn(w.provider, { ...where, fetchImpl: api.fetchImpl })
    expect(r).toEqual({ address: w.account.address, tier: 'holder', limit: 100 })
    expect(w.methods).toEqual(['eth_requestAccounts', 'personal_sign'])
    expect(w.methods.some((m) => m.startsWith('eth_sendTransaction') || m.startsWith('eth_signTypedData'))).toBe(false)

    const { message, signature } = api.sent[1]!.body as { message: string; signature: Hex }
    const parsed = parseSiweMessage(message)
    expect(parsed).toMatchObject({ address: w.account.address, chainId: 1, domain: 'emerald.test', nonce: 'n0nce12345678', uri: 'https://emerald.test', version: '1', statement: SIWE_STATEMENT })
    expect(parsed.expirationTime?.toISOString()).toBe('2026-09-30T20:05:00.000Z')
    expect(await recoverMessageAddress({ message, signature })).toBe(w.account.address)
  })

  it('no wallet, rejected signature and failed verify are typed errors', async () => {
    await expect(signIn(null, where)).rejects.toMatchObject({ reason: 'no_wallet' })
    await expect(signIn(fakeWallet({ reject: true }).provider, { ...where, fetchImpl: fakeApi().fetchImpl })).rejects.toMatchObject({ reason: 'rejected' })
    const bad = (async (url: string) =>
      url === '/api/auth/nonce' ? Response.json({ nonce: 'n0nce12345678' }) : Response.json({ error: 'bad_signature' }, { status: 401 })) as unknown as typeof fetch
    const err = await signIn(fakeWallet().provider, { ...where, fetchImpl: bad }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SignInError)
    expect(err).toMatchObject({ reason: 'verify', message: 'bad_signature' })
  })
})
