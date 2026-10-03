import type { BlockscoutTokenTransfer, BlockscoutTransaction } from './sources/raw-types.js'
import type { CheckResult, Hex, Reason, Sources } from './types.js'
import { addressUrl, errorMessage, lower, reason, sourceFailed } from './util.js'

export interface HistoryEntry {
  counterparty: Hex
  at: number
  /** true only if the user signed the tx (avoids counting transfers "planted" by the attacker). */
  genuine: boolean
}
export interface History {
  entries: HistoryEntry[]
  truncated: boolean
}
export type HistoryOutcome = { history: History; error: null } | { history: null; error: string }

/** First 4 + last 4 hex characters, lowercase: what a human in a hurry looks at. */
export const lookalikeKey = (a: Hex): string => a.slice(2, 6).toLowerCase() + a.slice(-4).toLowerCase()

const ts = (s: string | null): number => (s ? Date.parse(s) : Number.POSITIVE_INFINITY)

/** Counterparty history. A token transfer "from = user" counts as genuine only if its tx is among the ones the user sent. */
export function buildHistory(user: Hex, txs: BlockscoutTransaction[], transfers: BlockscoutTokenTransfer[]): HistoryEntry[] {
  const u = lower(user)
  const sent = new Set<string>()
  const out: HistoryEntry[] = []
  for (const t of txs) {
    if (lower(t.from.hash) !== u) continue
    sent.add(t.hash.toLowerCase())
    if (t.to) out.push({ counterparty: lower(t.to.hash), at: ts(t.timestamp), genuine: true })
  }
  for (const x of transfers) {
    const from = lower(x.from.hash)
    const to = lower(x.to.hash)
    if (from === u && to !== u) out.push({ counterparty: to, at: ts(x.timestamp), genuine: sent.has(x.transaction_hash.toLowerCase()) })
    else if (to === u && from !== u) out.push({ counterparty: from, at: ts(x.timestamp), genuine: false })
  }
  return out
}

/** Reads the history from Blockscout: txs sent by the user (2 pages) and ERC-20 transfers (2 pages). Never throws. */
export async function gatherHistory(user: Hex, sources: Sources): Promise<HistoryOutcome> {
  try {
    const [txs, transfers] = await Promise.all([
      sources.blockscout.getTransactions(user, { filter: 'from', maxPages: 2 }),
      sources.blockscout.getTokenTransfers(user, { maxPages: 2 }),
    ])
    return { history: { entries: buildHistory(user, txs.items, transfers.items), truncated: txs.truncated || transfers.truncated }, error: null }
  } catch (e) {
    return { history: null, error: errorMessage(e) }
  }
}

export function poisoningCheck(input: {
  user: Hex | null
  counterparty: Hex | null
  isRecipient: boolean
  outcome: HistoryOutcome | null
}): CheckResult {
  const { user, counterparty, isRecipient, outcome } = input
  if (!counterparty || (user && lower(counterparty) === lower(user))) return { check: 'poisoning', status: 'skipped', reasons: [] }
  if (!user) {
    // Without the user's address there is no history to compare against. For a value recipient that must not pass
    // silently: a poisoned address with no flags would otherwise come out green. Approvals have no recipient to impersonate.
    const reasons: Reason[] = isRecipient
      ? [reason('poisoning', 'POISONING_NO_USER', 'warn', "I couldn't compare this address with your history. Connect your wallet or paste your own address to check for look-alikes.")]
      : []
    return { check: 'poisoning', status: 'skipped', reasons }
  }
  if (!outcome || !outcome.history) {
    return { check: 'poisoning', status: 'failed', reasons: [sourceFailed('poisoning', 'your transaction history (address poisoning check)')] }
  }
  const d = lower(counterparty)
  const byCp = new Map<Hex, HistoryEntry[]>()
  for (const e of outcome.history.entries) byCp.set(e.counterparty, [...(byCp.get(e.counterparty) ?? []), e])
  const key = lookalikeKey(d)
  const lookalikes = [...byCp.keys()].filter((c) => c !== d && lookalikeKey(c) === key)
  const seen = (m: Hex) => byCp.get(m) ?? []
  const genuine = (m: Hex) => seen(m).some((e) => e.genuine)
  const firstSeen = (m: Hex) => Math.min(...seen(m).map((e) => e.at))
  const firstGenuine = (m: Hex) => Math.min(...seen(m).filter((e) => e.genuine).map((e) => e.at))
  const url = `${addressUrl(user)}?tab=token_transfers`
  const reasons: Reason[] = []
  const scope = outcome.history.truncated ? 'in your recent history' : 'in your history'

  if (lookalikes.length > 0) {
    // The original is the address the user actually used and that appeared first.
    const candidates = [d, ...lookalikes].filter(genuine)
    candidates.sort((a, b) => firstSeen(a) - firstSeen(b) || firstGenuine(a) - firstGenuine(b))
    const original = candidates[0]
    const others = lookalikes.join(', ')
    if (original === d) {
      reasons.push(reason('poisoning', 'POISONING_LOOKALIKE_IN_HISTORY', 'warn', `You have sent to ${d} before, but ${scope} there are look-alike addresses (${others}). Compare the full address, not just the start and the end.`, url))
    } else {
      const target = original ? `${original}, an address you really used` : 'an address in your history'
      reasons.push(reason('poisoning', 'POISONING_LOOKALIKE', 'danger', `${d} imitates ${target}: same first 4 and last 4 characters. This is address poisoning.`, url))
    }
  } else if (isRecipient && !genuine(d)) {
    reasons.push(reason('poisoning', 'FIRST_INTERACTION', 'warn', `You have never sent anything to ${d} ${scope}. Double-check it before sending.`, url))
  } else {
    reasons.push(reason('poisoning', 'POISONING_CLEAR', 'ok', `No look-alike of ${d} ${scope}.`))
  }
  return { check: 'poisoning', status: 'ok', reasons }
}
