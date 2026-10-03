import type { CheckResult, Hex, ParsedInput, Severity, Verdict } from './types.js'

const RANK: Record<Severity, number> = { danger: 0, warn: 1, ok: 2 }

/**
 * Spec §2. red: any danger reason. yellow: any warn or any failed check.
 * green: only if everything applicable ran and nothing fired. Never green with a non-empty checksFailed.
 *
 * Design decision 13: the $EMERALD CA itself (selfTokenAddress) is green "This is me." even when
 * warn reasons fire (e.g. CONTRACT_NEW right after launch); the reasons are still listed. It is
 * never softened past a danger reason (red wins) nor past a failed check (yellow: missing data).
 */
export function score(
  results: CheckResult[],
  input: ParsedInput,
  opts: { selfTokenAddress?: Hex },
): Pick<Verdict, 'level' | 'headline' | 'reasons' | 'checksOk' | 'checksFailed'> {
  // Stable sort: severity first, original order inside each severity.
  const reasons = results
    .flatMap((r) => r.reasons)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => RANK[a.r.severity] - RANK[b.r.severity] || a.i - b.i)
    .map(({ r }) => r)
  const checksOk = results.filter((r) => r.status === 'ok').map((r) => r.check)
  const checksFailed = results.filter((r) => r.status === 'failed').map((r) => r.check)
  const danger = reasons.some((r) => r.severity === 'danger')
  const warn = reasons.some((r) => r.severity === 'warn')
  const isSelf =
    input.kind === 'address' && !!opts.selfTokenAddress && input.address.toLowerCase() === opts.selfTokenAddress.toLowerCase()

  if (danger) {
    return { level: 'red', headline: input.kind === 'address' ? "Don't send." : "Don't sign.", reasons, checksOk, checksFailed }
  }
  if (isSelf && checksFailed.length === 0) return { level: 'green', headline: 'This is me.', reasons, checksOk, checksFailed }
  if (warn || checksFailed.length > 0) return { level: 'yellow', headline: 'Check before you sign.', reasons, checksOk, checksFailed }
  return { level: 'green', headline: 'Looks fine.', reasons, checksOk, checksFailed }
}
