// JSON shapes of the API contract (engine/types.ts after serializeVerdict: bigint -> string).
// The web consumes JSON and does not import the engine: it compiles and tests without plan 1.
export type Hex = `0x${string}`
export type Level = 'green' | 'yellow' | 'red'
export type CheckName = 'decode' | 'simulate' | 'poisoning' | 'labels' | 'token'
export type Severity = 'ok' | 'warn' | 'danger'
export type Tier = 'anon' | 'holder' | 'whale'
export type ChatErrorCode = 'quota' | 'paused' | 'llm' | 'bad_input'

export type WireInput =
  | { kind: 'tx'; tx: { from?: Hex; to: Hex; data: Hex; value: string } }
  | {
      kind: 'typedData'
      typedData: {
        domain: Record<string, unknown>
        types: Record<string, { name: string; type: string }[]>
        primaryType: string
        message: Record<string, unknown>
      }
    }
  | { kind: 'address'; address: Hex }
  | { kind: 'txHash'; hash: Hex }
  | { kind: 'unknown'; raw: string }

export interface WireReason { code: string; check: CheckName; severity: Severity; text: string; evidenceUrl?: string }

export interface WireVerdict {
  level: Level
  headline: string
  reasons: WireReason[]
  checksOk: CheckName[]
  checksFailed: CheckName[]
  input: WireInput
  chainId: 1
  engineVersion: string
}

export interface Usage { inputTokens: number; outputTokens: number; costUsd: number }
export interface QuotaInfo { tier: Tier; limit: number | null; used: number; resetAt: string }
export interface Quota429 { error: 'quota' | 'paused'; tier: Tier; limit: number | null; resetAt: string }
export interface ComputeInfo {
  llmUsd: number
  checksRun: number
  feesClaimableWei: string
  feesClaimedWei: string
  updatedAt: string
  /** Present when the fees accrue in a token other than WETH ($ZC): the raw amount and its symbol. */
  feesClaimableQuote?: string
  feesClaimedQuote?: string
  quoteSymbol?: string
}
export interface SignInResult { address: Hex; tier: Tier; limit: number | null }

export const CHECKS: readonly CheckName[] = ['decode', 'simulate', 'poisoning', 'labels', 'token']

const LEVELS = new Set<string>(['green', 'yellow', 'red'])
const SEVERITIES = new Set<string>(['ok', 'warn', 'danger'])
const CHECK_SET = new Set<string>(CHECKS)
const KINDS = new Set<string>(['tx', 'typedData', 'address', 'txHash', 'unknown'])
const TIERS = new Set<string>(['anon', 'holder', 'whale'])

export const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isCheckList = (x: unknown): x is CheckName[] => Array.isArray(x) && x.every((c) => typeof c === 'string' && CHECK_SET.has(c))
const isLimit = (x: unknown): x is number | null => x === null || typeof x === 'number'

export function isWireReason(r: unknown): r is WireReason {
  return (
    isObj(r) &&
    typeof r.code === 'string' &&
    typeof r.check === 'string' && CHECK_SET.has(r.check) &&
    typeof r.severity === 'string' && SEVERITIES.has(r.severity) &&
    typeof r.text === 'string' &&
    (r.evidenceUrl == null || typeof r.evidenceUrl === 'string')
  )
}

export function isWireVerdict(x: unknown): x is WireVerdict {
  return (
    isObj(x) &&
    typeof x.level === 'string' && LEVELS.has(x.level) &&
    typeof x.headline === 'string' &&
    Array.isArray(x.reasons) && x.reasons.every(isWireReason) &&
    isCheckList(x.checksOk) &&
    isCheckList(x.checksFailed) &&
    isObj(x.input) && typeof x.input.kind === 'string' && KINDS.has(x.input.kind) &&
    x.chainId === 1 &&
    typeof x.engineVersion === 'string'
  )
}

export function isUsage(x: unknown): x is Usage {
  return isObj(x) && typeof x.inputTokens === 'number' && typeof x.outputTokens === 'number' && typeof x.costUsd === 'number'
}

export function isQuotaInfo(x: unknown): x is QuotaInfo {
  return isObj(x) && typeof x.tier === 'string' && TIERS.has(x.tier) && isLimit(x.limit) && typeof x.used === 'number' && typeof x.resetAt === 'string'
}

export function isQuota429(x: unknown): x is Quota429 {
  return isObj(x) && (x.error === 'quota' || x.error === 'paused') && typeof x.tier === 'string' && TIERS.has(x.tier) && isLimit(x.limit) && typeof x.resetAt === 'string'
}

export function isComputeInfo(x: unknown): x is ComputeInfo {
  return (
    isObj(x) &&
    typeof x.llmUsd === 'number' &&
    typeof x.checksRun === 'number' &&
    typeof x.feesClaimableWei === 'string' &&
    typeof x.feesClaimedWei === 'string' &&
    typeof x.updatedAt === 'string'
  )
}

export function isSignInResult(x: unknown): x is SignInResult {
  return isObj(x) && typeof x.address === 'string' && x.address.startsWith('0x') && typeof x.tier === 'string' && TIERS.has(x.tier) && isLimit(x.limit)
}
