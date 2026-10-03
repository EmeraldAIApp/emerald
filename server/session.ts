import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Hex } from '../engine/types.js'

export const SESSION_COOKIE = 'em_session'
export const NONCE_COOKIE = 'em_nonce'
export const SESSION_TTL_S = 7 * 24 * 3600
export const NONCE_TTL_S = 5 * 60

function mac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest()
}

/** Token `base64url(json).base64url(hmac)`. Requires a secret of at least 32 characters. */
export function signToken<T extends object>(payload: T, secret: string): string {
  if (secret.length < 32) throw new Error('SESSION_SECRET must be >= 32 chars')
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${mac(secret, body).toString('base64url')}`
}

export function verifyToken<T extends { exp: number }>(token: string | undefined, secret: string, nowMs = Date.now()): T | null {
  if (!token || secret.length < 32) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), 'base64url')
  const expected = mac(secret, body)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: T
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) return null
  return payload
}

export interface SessionPayload {
  address: Hex
  iat: number
  exp: number
}
export interface NoncePayload {
  nonce: string
  exp: number
}

export function newSession(address: Hex, secret: string, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000)
  return signToken<SessionPayload>({ address, iat, exp: iat + SESSION_TTL_S }, secret)
}
