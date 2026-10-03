import { formatEther } from 'viem'
import { NATIVE_ETH } from './known.js'
import type { CheckName, Hex, Reason, Severity } from './types.js'

export const lower = (a: string): Hex => a.toLowerCase() as Hex

/** 0x123456…abcdef for texts. Longer than 4+4 on purpose: 4+4 is exactly what address poisoning imitates. */
export const short = (a: string): string => `${a.slice(0, 8)}…${a.slice(-6)}`.toLowerCase()

/**
 * External text (token names, tags, openchain functions): no control chars, line breaks or Unicode format
 * characters (\p{Cf}: bidi overrides like U+202E, zero-width chars, isolates) that could reorder or hide text, length-capped.
 */
export function safeText(s: string, max = 64): string {
  const clean = s.replace(/[\u0000-\u001f\u007f<>\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export const addressUrl = (a: string) => `https://eth.blockscout.com/address/${a}`
export const txUrl = (h: string) => `https://eth.blockscout.com/tx/${h}`

export function reason(check: CheckName, code: string, severity: Severity, text: string, evidenceUrl?: string): Reason {
  return evidenceUrl ? { code, check, severity, text, evidenceUrl } : { code, check, severity, text }
}

export function sourceFailed(check: CheckName, what: string): Reason {
  return reason(check, 'SOURCE_FAILED', 'warn', `I could not verify ${what}: a data source did not answer.`)
}

export function toBigInt(v: unknown): bigint | null {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : null
  if (typeof v === 'string' && /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(v.trim())) return BigInt(v.trim())
  return null
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Readable amount: ETH with 18 decimals; everything else in raw units (decimals are unknown without another call). */
export function describeAmount(asset: Hex, standard: 'native' | 'erc20' | 'erc721', amount: bigint): string {
  if (asset === NATIVE_ETH || standard === 'native') return `${formatEther(amount)} ETH`
  if (standard === 'erc721') return `${amount} NFT(s) of ${short(asset)}`
  return `${amount} raw units of token ${short(asset)}`
}
