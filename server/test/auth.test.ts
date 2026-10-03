import { createPublicClient, custom, type PublicClient } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { makeNonceHandler, makeVerifyHandler } from '../handlers/auth.js'
import { parseCookies } from '../http.js'
import { buildMessage, verifyLogin } from '../siwe.js'
import { fakeDeps, get, NOW, post } from './helpers.js'

const offline = createPublicClient({ chain: mainnet, transport: custom({ request: async () => { throw new Error('offline') } }) }) as PublicClient

async function login() {
  const deps = fakeDeps()
  const nonceRes = await makeNonceHandler(() => deps)(get('/api/auth/nonce'))
  const { nonce } = (await nonceRes.json()) as { nonce: string }
  const cookie = nonceRes.headers.get('set-cookie')!.split(';')[0]!
  const account = privateKeyToAccount(generatePrivateKey())
  const message = buildMessage({ address: account.address, domain: 'emerald.test', uri: 'https://emerald.test', nonce, now: NOW })
  const signature = await account.signMessage({ message })
  return { deps, nonce, cookie, account, message, signature }
}

describe('SIWE verifyLogin (offline)', () => {
  it('EOA signature verifies locally without RPC', async () => {
    const { account, message, signature, nonce } = await login()
    expect(await verifyLogin(offline, { message, signature, domain: 'emerald.test', nonce, now: NOW })).toEqual({ ok: true, address: account.address, via: 'eoa' })
  })
  it('wrong domain / nonce / expired -> invalid_fields; foreign signature with RPC down -> rpc_error', async () => {
    const { message, signature, nonce } = await login()
    expect(await verifyLogin(offline, { message, signature, domain: 'evil.test', nonce, now: NOW })).toEqual({ ok: false, reason: 'invalid_fields' })
    expect(await verifyLogin(offline, { message, signature, domain: 'emerald.test', nonce: 'other', now: NOW })).toEqual({ ok: false, reason: 'invalid_fields' })
    expect(await verifyLogin(offline, { message, signature, domain: 'emerald.test', nonce, now: new Date(NOW.getTime() + 10 * 60_000) })).toEqual({ ok: false, reason: 'invalid_fields' })
    const other = privateKeyToAccount(generatePrivateKey())
    const foreign = await other.signMessage({ message })
    expect(await verifyLogin(offline, { message, signature: foreign, domain: 'emerald.test', nonce, now: NOW })).toEqual({ ok: false, reason: 'rpc_error' })
  })
})

describe('SIWE verifyLogin: smart accounts (ERC-1271/6492, offline transport)', () => {
  const contract = (valid: boolean) =>
    createPublicClient({
      chain: mainnet,
      transport: custom({
        request: async ({ method }: { method: string }) => {
          if (method === 'eth_getCode') return '0x6080604052'
          if (method === 'eth_call') return `0x${(valid ? 1n : 0n).toString(16).padStart(64, '0')}`
          throw new Error(`unexpected ${method}`)
        },
      }),
    }) as PublicClient

  it('a contract wallet whose validator accepts the signature logs in via erc1271/6492; a rejecting one is bad_signature', async () => {
    const { message, nonce, account } = await login()
    const other = privateKeyToAccount(generatePrivateKey()) // the contract's owner key, not the address in the message
    const signature = await other.signMessage({ message })
    expect(await verifyLogin(contract(true), { message, signature, domain: 'emerald.test', nonce, now: NOW })).toEqual({ ok: true, address: account.address, via: 'erc1271/6492' })
    expect(await verifyLogin(contract(false), { message, signature, domain: 'emerald.test', nonce, now: NOW })).toEqual({ ok: false, reason: 'bad_signature' })
  })
})

describe('/api/auth/verify: SIWE domain', () => {
  const verifyAt = async (url: string, headers: Record<string, string>, env: Record<string, string> = {}) => {
    const deps = fakeDeps({ env })
    const nonceRes = await makeNonceHandler(() => deps)(get('/api/auth/nonce'))
    const { nonce } = (await nonceRes.json()) as { nonce: string }
    const cookie = nonceRes.headers.get('set-cookie')!.split(';')[0]!
    const account = privateKeyToAccount(generatePrivateKey())
    const message = buildMessage({ address: account.address, domain: 'emerald.test', uri: 'https://emerald.test', nonce, now: NOW })
    const signature = await account.signMessage({ message })
    const req = new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers }, body: JSON.stringify({ message, signature }) })
    return (await makeVerifyHandler(() => deps, () => offline)(req)).status
  }

  it('uses the Host header the browser sent, even when the runtime URL has another host', async () => {
    expect(await verifyAt('http://internal.vercel.local/api/auth/verify', { host: 'emerald.test' })).toBe(200)
    expect(await verifyAt('http://internal.vercel.local/api/auth/verify', { host: 'evil.test' })).toBe(401)
  })
  it('PUBLIC_HOST overrides it; a client-sent x-forwarded-host is not trusted', async () => {
    expect(await verifyAt('http://internal.vercel.local/api/auth/verify', { host: 'other.test' }, { PUBLIC_HOST: 'emerald.test' })).toBe(200)
    expect(await verifyAt('https://evil.test/api/auth/verify', { 'x-forwarded-host': 'emerald.test' })).toBe(401)
  })
})

describe('/api/auth/nonce: per-IP limit', () => {
  it('more than 10 nonces per minute from one IP is 429 before anything is written; other IPs and the next minute pass', async () => {
    let now = NOW.getTime()
    const deps = fakeDeps({ now: () => new Date(now) })
    const nonce = makeNonceHandler(() => deps)
    for (let i = 0; i < 10; i++) expect((await nonce(get('/api/auth/nonce'))).status).toBe(200)
    const limited = await nonce(get('/api/auth/nonce'))
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'rate_limited' })
    expect(limited.headers.get('set-cookie')).toBeNull()
    expect((await nonce(get('/api/auth/nonce', { 'x-real-ip': '8.8.8.8' }))).status).toBe(200)
    now += 60_000
    expect((await nonce(get('/api/auth/nonce'))).status).toBe(200)
  })
})

describe('/api/auth/nonce + /api/auth/verify', () => {
  it('nonce sets an httpOnly signed cookie', async () => {
    const { cookie, nonce } = await login()
    expect(cookie.startsWith('em_nonce=')).toBe(true)
    expect(nonce).toMatch(/^[a-zA-Z0-9]{96}$/)
  })

  it('verify sets em_session and answers {address, tier, limit}; the nonce is single-use', async () => {
    const { deps, cookie, account, message, signature } = await login()
    const verify = makeVerifyHandler(() => deps, () => offline)
    const res = await verify(post('/api/auth/verify', { message, signature }, { cookie }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ address: account.address, tier: 'anon', limit: 5 })
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some((c) => c.startsWith('em_session=') && c.includes('HttpOnly'))).toBe(true)
    expect(parseCookies(setCookies.find((c) => c.startsWith('em_nonce='))!.split(';')[0]!)).toEqual({ em_nonce: '' })
    const replay = await verify(post('/api/auth/verify', { message, signature }, { cookie }))
    expect(replay.status).toBe(401)
    expect(await replay.json()).toEqual({ error: 'nonce' })
  })

  it('a cross-site POST to verify is 403', async () => {
    const { deps, cookie, message, signature } = await login()
    const res = await makeVerifyHandler(() => deps, () => offline)(post('/api/auth/verify', { message, signature }, { cookie, origin: 'https://evil.test' }))
    expect(res.status).toBe(403)
  })

  it('no nonce cookie -> 401; bad body -> 400', async () => {
    const { deps, cookie } = await login()
    const verify = makeVerifyHandler(() => deps, () => offline)
    expect((await verify(post('/api/auth/verify', { message: 'x', signature: '0x00' }))).status).toBe(401)
    expect((await verify(post('/api/auth/verify', { message: 1 }, { cookie }))).status).toBe(400)
  })
})
