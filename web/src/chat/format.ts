// Pure formatting for the device-view. Everything from outside (engine, LLM, input) goes through esc().
import type { CheckName, QuotaInfo, WireInput, WireVerdict } from './wire.js'

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

/** 0x3f1c…a9e2 (as on the board). Leaves anything that is not long hex untouched. */
export function shortHex(h: string, head = 6, tail = 4): string {
  return /^0x[0-9a-fA-F]+$/.test(h) && h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h
}

/** Shortens every address or hash inside a text (only for compact views: S3 and mini-screens). */
export function compactHex(text: string): string {
  return text.replace(/0x[0-9a-fA-F]{40,64}\b/g, (h) => shortHex(h))
}

/** Typographic apostrophe for the verdict headline (Don't -> Don’t). */
export function typo(s: string): string {
  return s.replace(/'/g, '’')
}

/** Only https:// goes out as a link (defense in depth on evidenceUrl). */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null
  try {
    return new URL(u).protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

export function titleFor(input: WireInput): string {
  switch (input.kind) {
    case 'typedData': {
      const name = input.typedData.domain.name
      return `${typeof name === 'string' && name ? name : input.typedData.primaryType} signature request`
    }
    case 'tx':
      return `Transaction to ${shortHex(input.tx.to)}`
    case 'address':
      return `Address ${shortHex(input.address)}`
    case 'txHash':
      return `Transaction ${shortHex(input.hash)}`
    case 'unknown':
      return 'Couldn’t read that'
  }
}

/**
 * What the engine could not verify: the checks that failed, plus the ones that did not run and left a warn reason
 * (a pasted address with no wallet connected skips poisoning with POISONING_NO_USER, and that is not in checksFailed).
 */
export function couldntCheck(v: WireVerdict): string {
  const gaps = new Set<CheckName>(v.checksFailed)
  for (const r of v.reasons) if (r.severity === 'warn' && !v.checksOk.includes(r.check)) gaps.add(r.check)
  return `Couldn’t check: ${gaps.size > 0 ? [...gaps].join(', ') : 'nothing'}.`
}

export type RowState = 'danger' | 'warn' | 'ok' | 'failed' | 'skipped' | 'waiting'

/** One row of the S3 checks table, derived from the verdict only. */
export function checkRow(v: WireVerdict | null, check: CheckName): { state: RowState; text: string } {
  if (!v) return { state: 'waiting', text: 'waiting' }
  const mine = v.reasons.filter((r) => r.check === check)
  const bad = mine.find((r) => r.severity === 'danger') ?? mine.find((r) => r.severity === 'warn')
  if (bad) return { state: bad.severity === 'danger' ? 'danger' : 'warn', text: bad.text }
  if (v.checksFailed.includes(check)) return { state: 'failed', text: 'couldn’t check' }
  if (v.checksOk.includes(check)) return { state: 'ok', text: mine[0]?.text ?? 'nothing found' }
  return { state: 'skipped', text: 'not needed here' }
}

/** HH:MM UTC of the quota reset (00:00 UTC if unknown). */
export function resetClock(iso: string | null): string {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return '00:00 UTC'
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}

export function quotaLine(q: QuotaInfo): string {
  if (q.limit === null) return 'No daily limit.'
  const left = Math.max(0, q.limit - q.used)
  if (left === 0) return `You’ve used today’s free checks. More at ${resetClock(q.resetAt)}.`
  return left === 1 ? '1 free check left today.' : `${left} free checks left today.`
}

/** wei (decimal string) -> ETH with `decimals` decimals, truncated. Garbage -> 0. */
export function ethFromWei(wei: string, decimals = 3): string {
  let v: bigint
  try {
    v = BigInt(wei)
  } catch {
    v = 0n
  }
  if (v < 0n) v = 0n
  const unit = 10n ** 18n
  const frac = (v % unit).toString().padStart(18, '0').slice(0, decimals)
  return decimals > 0 ? `${v / unit}.${frac}` : `${v / unit}`
}

export function usd(n: number): string {
  return `$${(Number.isFinite(n) && n > 0 ? n : 0).toFixed(2)}`
}

/** Preview of the paste while it is read: one line, 96 characters max. */
export function preview(input: string, max = 96): string {
  const one = input.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}
