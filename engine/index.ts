import { gatherAccounts, type AccountFacts } from './accounts.js'
import { decodeAction, decodeCheck, spenderOf, type DecodeOutcome } from './decode.js'
import { labelsCheck } from './labels.js'
import { parseInput } from './parse.js'
import { gatherHistory, poisoningCheck, type HistoryOutcome } from './poisoning.js'
import { score } from './score.js'
import { gatherSimulation, simulateCheck } from './simulate.js'
import { resolveSubject } from './subject.js'
import { gatherTokens, tokenCheck, tokenTargets } from './token.js'
import type { Action, CheckName, CheckResult, Hex, Sources, Subject, Verdict } from './types.js'
import { lower, reason, sourceFailed } from './util.js'

export const ENGINE_VERSION = '1.0.0'
const CHECKS: CheckName[] = ['decode', 'simulate', 'poisoning', 'labels', 'token']
const MAX_PARTIES = 5

export interface RunContext {
  sources: Sources
  userAddress?: Hex
  selfTokenAddress?: Hex
  now?: Date
}

/** Who the input deals with (for poisoning). */
function counterpartyOf(subject: Subject, a: Action): Hex | null {
  if (subject.kind === 'address') return subject.address
  if (a.type === 'nativeTransfer' || a.type === 'tokenTransfer') return a.to
  const s = spenderOf(a)
  if (s) return s
  return subject.kind === 'tx' ? subject.tx.to : null
}

/** Addresses whose reputation gets checked (labels). The user does not count. */
function partiesOf(subject: Subject, a: Action, actor: Hex | null): Hex[] {
  const set = new Set<Hex>()
  if (subject.kind === 'address') set.add(subject.address)
  if (subject.kind === 'tx') set.add(subject.tx.to)
  const s = spenderOf(a)
  if (s) set.add(s)
  if (a.type === 'nativeTransfer' || a.type === 'tokenTransfer') set.add(a.to)
  // A mined tx sent by someone else that moved the user's assets: check who sent it and where they went.
  if (subject.kind === 'tx' && subject.executed && actor && subject.tx.from && subject.tx.from !== actor) {
    set.add(subject.tx.from)
    for (const m of subject.executed.movements) if (m.kind === 'transfer' && m.from === actor) set.add(m.to)
  }
  // The actor never counts as a party, except when the pasted address IS the user: removing it would leave
  // nothing to check and the verdict would come out green with zero checks run.
  if (actor && subject.kind !== 'address') set.delete(actor)
  return [...set].slice(0, MAX_PARTIES)
}

function isValueRecipient(subject: Subject, a: Action, actor: Hex | null, accounts: Map<Hex, AccountFacts>): boolean {
  if (subject.kind === 'address') return !accounts.get(subject.address)?.blockscout?.isToken
  if (a.type === 'nativeTransfer') return true
  return a.type === 'tokenTransfer' && (a.from === null || a.from === actor)
}

const UNEXPECTED: Record<CheckName, string> = {
  decode: 'what this input does',
  simulate: 'what this transaction would do',
  poisoning: 'your transaction history (address poisoning check)',
  labels: 'the reputation of every address involved (GoPlus or Blockscout)',
  token: 'whether the token can be sold (GoPlus)',
}

/** Design decision 1: a source answer with an unexpected shape makes that check fail (yellow), never the whole verdict. */
function guarded(check: CheckName, run: () => CheckResult): CheckResult {
  try {
    return run()
  } catch {
    return { check, status: 'failed', reasons: [sourceFailed(check, UNEXPECTED[check])] }
  }
}

export async function runChecks(input: string, ctx: RunContext): Promise<Verdict> {
  const now = ctx.now ?? new Date()
  const parsed = parseInput(input)
  const base = { input: parsed, chainId: 1 as const, engineVersion: ENGINE_VERSION }
  if (parsed.kind === 'unknown') {
    const results: CheckResult[] = CHECKS.map((check) => ({ check, status: 'skipped', reasons: [] }))
    results[0]!.reasons.push(reason('decode', 'INPUT_UNRECOGNIZED', 'warn', 'I did not find an address, a transaction hash, a transaction or a signature request in this input.'))
    return { ...score(results, parsed, {}), ...base }
  }
  const user = ctx.userAddress ? lower(ctx.userAddress) : null
  const subject = await resolveSubject(parsed, ctx.sources)
  // The actor is whoever signs or loses the assets: for an unsigned tx it is tx.from ?? user; for a mined hash, user ?? tx.from.
  const actor = subject.kind === 'tx' ? (subject.executed ? (user ?? subject.tx.from) : (subject.tx.from ?? user)) : user

  let decoded: DecodeOutcome
  try {
    decoded = await decodeAction(subject, ctx.sources)
  } catch {
    // An answer with an unexpected shape: decode fails (SOURCE_FAILED, yellow) instead of throwing the verdict.
    decoded = { action: { type: 'none' }, notes: [], failed: true, applicable: true }
  }
  const counterparty = counterpartyOf(subject, decoded.action)
  const parties = partiesOf(subject, decoded.action, actor)
  const historyP: Promise<HistoryOutcome | null> = actor && counterparty ? gatherHistory(actor, ctx.sources) : Promise.resolve(null)
  const [accounts, sim, history] = await Promise.all([gatherAccounts(parties, ctx.sources), gatherSimulation(subject, actor, ctx.sources), historyP])
  const targets = tokenTargets(subject, sim, accounts, actor)
  const tokens = await gatherTokens(targets, ctx.sources)

  const poisoning = guarded('poisoning', () =>
    poisoningCheck({ user: actor, counterparty, isRecipient: isValueRecipient(subject, decoded.action, actor, accounts), outcome: history }),
  )
  if (subject.kind === 'address' && actor && subject.address === actor) {
    poisoning.reasons.push(reason('poisoning', 'OWN_ADDRESS', 'ok', 'This is your own address.'))
  }
  const results: CheckResult[] = [
    guarded('decode', () => decodeCheck(decoded, accounts, now)),
    guarded('simulate', () => simulateCheck({ outcome: sim, actor, action: decoded.action, txTo: subject.kind === 'tx' ? accounts.get(subject.tx.to) : undefined, now })),
    poisoning,
    guarded('labels', () => labelsCheck({ parties, accounts, now })),
    guarded('token', () => tokenCheck(targets, tokens)),
  ]
  return { ...score(results, parsed, { selfTokenAddress: ctx.selfTokenAddress }), ...base }
}

/** Verdict JSON (bigint -> string). One line: usable as is as the data of an SSE event. */
export function serializeVerdict(v: Verdict): string {
  return JSON.stringify(v, (_k, val: unknown) => (typeof val === 'bigint' ? val.toString() : val))
}

export { parseInput } from './parse.js'
export type * from './types.js'
