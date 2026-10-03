import { describe, expect, it } from 'vitest'
import { EnvError, readEnv } from '../env.js'
import { clientIp, parseCookies, serializeCookie, sseFrame, sseRaw } from '../http.js'
import { newSession, signToken, verifyToken, type SessionPayload } from '../session.js'

const SECRET = 'x'.repeat(32)
const dec = (u: Uint8Array) => new TextDecoder().decode(u)

describe('readEnv', () => {
  it('defaults from the contract', () => {
    const e = readEnv({})
    expect(e).toMatchObject({
      CLAUDE_MODEL: 'claude-opus-5',
      RPC_URL: 'https://ethereum-rpc.publicnode.com',
      FEE_ESCROW: '0xAcefe251da006887dA41C063D06CC82A060824BA',
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      DAILY_SPEND_CAP_USD: 20,
      EMERALD_TOKEN_ADDRESS: undefined,
      CREATOR_ADDRESS: undefined,
    })
  })
  it('checksums addresses and rejects garbage', () => {
    expect(readEnv({ EMERALD_TOKEN_ADDRESS: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed' }).EMERALD_TOKEN_ADDRESS).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')
    expect(() => readEnv({ CREATOR_ADDRESS: 'nope' })).toThrow(EnvError)
    expect(() => readEnv({ DAILY_SPEND_CAP_USD: 'abc' })).toThrow(EnvError)
  })
})

describe('readEnv on Vercel (fail closed)', () => {
  const PROD = { VERCEL: '1', UPSTASH_REDIS_REST_URL: 'https://x.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't', SESSION_SECRET: 's'.repeat(32) }
  it('a complete production env passes', () => {
    expect(readEnv(PROD).SESSION_SECRET).toBe('s'.repeat(32))
  })
  it('on Vercel, missing Upstash (per-instance quotas and spend cap) or a short SESSION_SECRET is an error, not a warning', () => {
    expect(() => readEnv({ ...PROD, UPSTASH_REDIS_REST_URL: '' })).toThrow(EnvError)
    expect(() => readEnv({ ...PROD, UPSTASH_REDIS_REST_TOKEN: undefined })).toThrow(EnvError)
    expect(() => readEnv({ ...PROD, SESSION_SECRET: 'short' })).toThrow(EnvError)
    expect(() => readEnv({ ...PROD, SESSION_SECRET: undefined })).toThrow(EnvError)
  })
  it('outside Vercel the in-memory fallback stays allowed (tests, dev-api)', () => {
    expect(() => readEnv({})).not.toThrow()
  })
})

describe('http helpers', () => {
  it('cookies round-trip', () => {
    const c = serializeCookie('em_nonce', 'a b', { maxAge: 300, sameSite: 'Strict' })
    expect(c).toBe('em_nonce=a%20b; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Strict')
    expect(parseCookies('em_nonce=a%20b; other=1')).toEqual({ em_nonce: 'a b', other: '1' })
  })
  it('client IP: x-real-ip, then first x-forwarded-for hop', () => {
    expect(clientIp(new Request('https://e.test', { headers: { 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' } }))).toBe('1.1.1.1')
    expect(clientIp(new Request('https://e.test', { headers: { 'x-forwarded-for': '2.2.2.2, 10.0.0.1' } }))).toBe('2.2.2.2')
  })
  it('SSE frames: one JSON line, bigint as string', () => {
    expect(dec(sseFrame('delta', { text: 'hi', n: 5n }))).toBe('event: delta\ndata: {"text":"hi","n":"5"}\n\n')
    expect(dec(sseRaw('verdict', '{"level":"red"}'))).toBe('event: verdict\ndata: {"level":"red"}\n\n')
  })
})

describe('session tokens (HMAC-SHA256)', () => {
  const now = Date.parse('2026-09-30T20:00:00Z')
  it('valid session round-trips', () => {
    const t = newSession('0x0000000000000000000000000000000000000001', SECRET, now)
    expect(verifyToken<SessionPayload>(t, SECRET, now + 1000)?.address).toBe('0x0000000000000000000000000000000000000001')
  })
  it('rejects tampering, another secret, truncation and expiry', () => {
    const t = newSession('0x0000000000000000000000000000000000000001', SECRET, now)
    const [body, sig] = t.split('.') as [string, string]
    const forged = Buffer.from(JSON.stringify({ address: '0x0000000000000000000000000000000000000002', iat: 0, exp: 9e9 })).toString('base64url')
    expect(verifyToken(`${forged}.${sig}`, SECRET, now)).toBeNull()
    expect(verifyToken(t, 'y'.repeat(32), now)).toBeNull()
    expect(verifyToken(`${body}.${sig.slice(0, 10)}`, SECRET, now)).toBeNull()
    expect(verifyToken(t, SECRET, now + 8 * 24 * 3600 * 1000)).toBeNull()
  })
  it('refuses short secrets', () => {
    expect(() => signToken({ exp: 1 }, 'short')).toThrow()
    expect(verifyToken('a.b', 'short')).toBeNull()
  })
})
