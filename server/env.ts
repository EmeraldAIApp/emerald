import { getAddress, isAddress } from 'viem'
import type { Hex } from '../engine/types.js'

export interface Env {
  ANTHROPIC_API_KEY: string | undefined
  /** Needed only with a personal key (sk-ant-usr-…), which is not scoped to a workspace. */
  ANTHROPIC_WORKSPACE_ID: string | undefined
  CLAUDE_MODEL: string
  RPC_URL: string
  UPSTASH_REDIS_REST_URL: string | undefined
  UPSTASH_REDIS_REST_TOKEN: string | undefined
  SESSION_SECRET: string
  EMERALD_TOKEN_ADDRESS: Hex | undefined
  CREATOR_ADDRESS: Hex | undefined
  FEE_ESCROW: Hex
  WETH: Hex
  DAILY_SPEND_CAP_USD: number
  /** Optional override of the public host (SIWE domain, same-origin check) when the Host header is not the public one. */
  PUBLIC_HOST: string | undefined
}

export class EnvError extends Error {}

function optionalAddress(name: string, v: string | undefined): Hex | undefined {
  if (!v) return undefined
  if (!isAddress(v, { strict: false })) throw new EnvError(`${name} is not an address: ${v}`)
  return getAddress(v)
}

function publicHost(v: string | undefined): string | undefined {
  if (!v) return undefined
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(v)) throw new EnvError(`PUBLIC_HOST must be a bare host (example.com or localhost:5173): ${v}`)
  return v.toLowerCase()
}

export function readEnv(e: NodeJS.ProcessEnv = process.env): Env {
  const cap = Number(e.DAILY_SPEND_CAP_USD || 20)
  if (!Number.isFinite(cap) || cap < 0) throw new EnvError(`DAILY_SPEND_CAP_USD must be a number >= 0: ${e.DAILY_SPEND_CAP_USD}`)
  // On Vercel (production and previews) fail closed: an in-memory store would make the anonymous quota and the daily
  // spend cap per instance (reset on every cold start) and the SIWE nonce not single-use; an empty secret disables login.
  if (e.VERCEL) {
    if (!e.UPSTASH_REDIS_REST_URL || !e.UPSTASH_REDIS_REST_TOKEN) throw new EnvError('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required on Vercel')
    if ((e.SESSION_SECRET ?? '').length < 32) throw new EnvError('SESSION_SECRET (>= 32 chars) is required on Vercel')
  }
  return {
    ANTHROPIC_API_KEY: e.ANTHROPIC_API_KEY || undefined,
    ANTHROPIC_WORKSPACE_ID: e.ANTHROPIC_WORKSPACE_ID?.trim() || undefined,
    CLAUDE_MODEL: e.CLAUDE_MODEL || 'claude-opus-5',
    RPC_URL: e.RPC_URL || 'https://ethereum-rpc.publicnode.com',
    UPSTASH_REDIS_REST_URL: e.UPSTASH_REDIS_REST_URL || undefined,
    UPSTASH_REDIS_REST_TOKEN: e.UPSTASH_REDIS_REST_TOKEN || undefined,
    SESSION_SECRET: e.SESSION_SECRET ?? '',
    EMERALD_TOKEN_ADDRESS: optionalAddress('EMERALD_TOKEN_ADDRESS', e.EMERALD_TOKEN_ADDRESS),
    CREATOR_ADDRESS: optionalAddress('CREATOR_ADDRESS', e.CREATOR_ADDRESS),
    FEE_ESCROW: optionalAddress('FEE_ESCROW', e.FEE_ESCROW) ?? '0xAcefe251da006887dA41C063D06CC82A060824BA',
    WETH: optionalAddress('WETH', e.WETH) ?? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    DAILY_SPEND_CAP_USD: cap,
    PUBLIC_HOST: publicHost(e.PUBLIC_HOST),
  }
}
