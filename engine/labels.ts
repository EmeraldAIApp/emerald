import { isContractFact, isYoung, type AccountFacts } from './accounts.js'
import { GOPLUS_DANGER_FLAGS, GOPLUS_WARN_FLAGS, NEW_CONTRACT_MS, SCAM_TAG_SLUGS } from './known.js'
import type { CheckResult, Hex, Reason } from './types.js'
import { addressUrl, reason, safeText, short, sourceFailed } from './util.js'

const goplusUrl = (a: string) => `https://api.gopluslabs.io/api/v1/address_security/${a}?chain_id=1`

function partyReasons(f: AccountFacts, now: Date): Reason[] {
  const a = f.address
  const who = short(a)
  const out: Reason[] = []
  const gp = f.goplus
  if (gp) {
    const flags: string[] = GOPLUS_DANGER_FLAGS.filter((k) => gp[k] === '1')
    if (Number(gp.number_of_malicious_contracts_created || '0') > 0) flags.push('number_of_malicious_contracts_created')
    if (flags.length) {
      const src = gp.data_source ? ` (source: ${safeText(gp.data_source)})` : ''
      out.push(reason('labels', 'LABEL_FLAGGED_GOPLUS', 'danger', `GoPlus flags ${who}: ${flags.join(', ')}${src}.`, goplusUrl(a)))
    }
    const warns = GOPLUS_WARN_FLAGS.filter((k) => gp[k] === '1')
    if (warns.length) out.push(reason('labels', 'LABEL_RISK_GOPLUS', 'warn', `GoPlus notes risk signals on ${who}: ${warns.join(', ')}.`, goplusUrl(a)))
  }
  const scamTags = (f.tags ?? []).filter((t) => SCAM_TAG_SLUGS.has(t.slug) || /^fake_phishing/i.test(t.name))
  if (f.blockscout?.isScam || f.blockscout?.reputation === 'scam' || scamTags.length) {
    const names = scamTags.map((t) => safeText(t.name, 40)).join(', ')
    out.push(reason('labels', 'LABEL_FLAGGED_BLOCKSCOUT', 'danger', `Blockscout marks ${who} as a scam${names ? ` (${names})` : ''}.`, addressUrl(a)))
  }
  if (isContractFact(f) && f.blockscout && !f.blockscout.isVerified) {
    out.push(reason('labels', 'CONTRACT_UNVERIFIED', 'warn', `${who} is a contract whose source code is not verified.`, addressUrl(a)))
  }
  if (isContractFact(f) && isYoung(f, now) && f.createdAt) {
    const days = Math.max(0, Math.floor((now.getTime() - f.createdAt.getTime()) / (NEW_CONTRACT_MS / 7)))
    out.push(reason('labels', 'CONTRACT_NEW', 'warn', `${who} is a contract created ${days} day(s) ago (less than 7).`, addressUrl(a)))
  }
  if (!out.some((r) => r.severity === 'danger')) {
    if (f.blockscout?.ens) out.push(reason('labels', 'ENS_NAME', 'ok', `${who} has the reverse ENS name ${safeText(f.blockscout.ens, 40)}.`, addressUrl(a)))
    const name = (f.tags ?? []).find((t) => t.tagType === 'name')?.name ?? f.blockscout?.name
    if (name) out.push(reason('labels', 'KNOWN_NAME', 'ok', `Blockscout names ${who} "${safeText(name, 48)}".`, addressUrl(a)))
    if (f.kind === 'eip7702') {
      const to = f.blockscout?.delegateName ? safeText(f.blockscout.delegateName, 40) : f.delegate ? short(f.delegate) : 'a contract'
      out.push(reason('labels', 'EIP7702_DELEGATED', 'ok', `${who} is a wallet delegated with EIP-7702 to ${to}.`, addressUrl(a)))
    }
  }
  if (out.length === 0) out.push(reason('labels', 'LABELS_CLEAR', 'ok', `No flags on ${who} in GoPlus or Blockscout.`, addressUrl(a)))
  return out
}

/** Spec §2 labels: GoPlus and Blockscout flags, unverified contract or < 7 days old, reverse ENS. */
export function labelsCheck(input: { parties: Hex[]; accounts: Map<Hex, AccountFacts>; now: Date }): CheckResult {
  const { parties, accounts, now } = input
  if (parties.length === 0) return { check: 'labels', status: 'skipped', reasons: [] }
  const reasons: Reason[] = []
  let failed = false
  for (const p of parties) {
    const f = accounts.get(p)
    if (!f) {
      failed = true
      continue
    }
    if (f.failed.some((x) => x === 'blockscout' || x === 'goplus' || x === 'creation' || x === 'metadata')) failed = true
    reasons.push(...partyReasons(f, now))
  }
  if (failed) reasons.push(sourceFailed('labels', 'the reputation of every address involved (GoPlus or Blockscout)'))
  return { check: 'labels', status: failed ? 'failed' : 'ok', reasons }
}
