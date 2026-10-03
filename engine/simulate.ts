import { isYoung, partyClass, type AccountFacts } from './accounts.js'
import { NATIVE_ETH, TOPIC, WETH, ZERO } from './known.js'
import type { RpcLog } from './sources/raw-types.js'
import type { Action, CheckResult, Hex, Movement, Reason, Sources, Subject } from './types.js'
import { describeAmount, errorMessage, lower, reason, safeText, short, sourceFailed } from './util.js'

export interface SimulationFacts {
  source: 'simulated' | 'executed'
  status: 'success' | 'reverted'
  revertReason: string | null
  sender: Hex
  movements: Movement[]
}
export type SimulationOutcome =
  | { applicable: false; noSender: boolean }
  | { applicable: true; facts: SimulationFacts | null; error: string | null }

const topicAddr = (t: string): Hex => lower(`0x${t.slice(26)}`)

/** Decodes one log; null when it is not a movement we track. Throws on malformed data (e.g. `data === '0x'`). */
function decodeLog(l: RpcLog): Movement | null {
  const asset = lower(l.address)
  const [t0, t1, t2, t3] = l.topics
  if (!t0) return null
  if (t0 === TOPIC.Transfer && t1 && t2 && l.topics.length === 3) {
    return { kind: 'transfer', asset, standard: asset === NATIVE_ETH ? 'native' : 'erc20', from: topicAddr(t1), to: topicAddr(t2), amount: BigInt(l.data) }
  }
  if (t0 === TOPIC.Transfer && t1 && t2 && t3) {
    return { kind: 'transfer', asset, standard: 'erc721', from: topicAddr(t1), to: topicAddr(t2), amount: 1n, tokenId: BigInt(t3) }
  }
  if (t0 === TOPIC.WethDeposit && asset === WETH && t1) {
    return { kind: 'transfer', asset, standard: 'erc20', from: ZERO, to: topicAddr(t1), amount: BigInt(l.data) }
  }
  if (t0 === TOPIC.WethWithdrawal && asset === WETH && t1) {
    return { kind: 'transfer', asset, standard: 'erc20', from: topicAddr(t1), to: ZERO, amount: BigInt(l.data) }
  }
  if (t0 === TOPIC.Approval && t1 && t2 && l.topics.length === 3) {
    return { kind: 'approval', asset, standard: 'erc20', owner: topicAddr(t1), spender: topicAddr(t2), amount: BigInt(l.data) }
  }
  if (t0 === TOPIC.Approval && t1 && t2 && t3) {
    return { kind: 'approval', asset, standard: 'erc721', owner: topicAddr(t1), spender: topicAddr(t2), amount: BigInt(t3) }
  }
  if (t0 === TOPIC.ApprovalForAll && t1 && t2) {
    return { kind: 'approvalForAll', asset, owner: topicAddr(t1), operator: topicAddr(t2), approved: BigInt(l.data) !== 0n }
  }
  return null
}

/**
 * Decodes eth_simulateV1 logs (verified with the 5 fixtures): Transfer ERC-20/721, native ETH, WETH Deposit/Withdrawal, approvals.
 * Logs come from any contract in the simulation, so they are attacker-controlled: a malformed log (empty or non-hex data)
 * is skipped on its own and never stops the other movements from being decoded.
 */
export function extractMovements(logs: RpcLog[]): Movement[] {
  const out: Movement[] = []
  for (const l of logs) {
    try {
      const m = decodeLog(l)
      if (m) out.push(m)
    } catch {
      continue
    }
  }
  return out
}

export interface Delta {
  asset: Hex
  standard: 'native' | 'erc20' | 'erc721'
  amount: bigint
}
/** Net balance per asset for `who`. Negative = leaves the wallet. */
export function netDeltas(moves: Movement[], who: Hex): Delta[] {
  const w = lower(who)
  const d = new Map<Hex, Delta>()
  for (const m of moves) {
    if (m.kind !== 'transfer' || m.from === m.to) continue
    const cur = d.get(m.asset) ?? { asset: m.asset, standard: m.standard, amount: 0n }
    if (m.from === w) cur.amount -= m.amount
    if (m.to === w) cur.amount += m.amount
    d.set(m.asset, cur)
  }
  return [...d.values()].filter((x) => x.amount !== 0n)
}

export async function gatherSimulation(subject: Subject, actor: Hex | null, sources: Sources): Promise<SimulationOutcome> {
  if (subject.kind !== 'tx') return { applicable: false, noSender: false }
  const { tx, executed } = subject
  if (executed) {
    return {
      applicable: true,
      error: null,
      facts: { source: 'executed', status: executed.status, revertReason: null, sender: tx.from ?? ZERO, movements: executed.movements },
    }
  }
  const from = tx.from ?? actor
  if (!from) return { applicable: false, noSender: true }
  try {
    const opts = tx.value > 0n ? { balanceOverride: tx.value + 10n ** 18n } : {}
    const r = await sources.rpc.simulate({ from, to: tx.to, data: tx.data, value: tx.value }, opts)
    const ok = r.status === '0x1'
    return {
      applicable: true,
      error: null,
      facts: { source: 'simulated', status: ok ? 'success' : 'reverted', revertReason: ok ? null : (r.error?.message ?? null), sender: lower(from), movements: ok ? extractMovements(r.logs) : [] },
    }
  } catch (e) {
    return { applicable: true, facts: null, error: errorMessage(e) }
  }
}

/** A plain send by the user (ETH or token transfer): the outflow is what the user asked for. */
function isPlainSend(a: Action, who: Hex, outs: Delta[]): boolean {
  if (a.type === 'nativeTransfer') return outs.every((o) => o.asset === NATIVE_ETH)
  if (a.type === 'tokenTransfer' && (a.from === null || a.from === who)) return outs.every((o) => o.asset === a.token)
  return false
}

const describe = (ds: Delta[]) => ds.map((d) => describeAmount(d.asset, d.standard, d.amount < 0n ? -d.amount : d.amount)).join(', ')

export function simulateCheck(input: { outcome: SimulationOutcome; actor: Hex | null; action: Action; txTo: AccountFacts | undefined; now: Date }): CheckResult {
  const { outcome, actor, action, txTo, now } = input
  if (!outcome.applicable) {
    const reasons: Reason[] = outcome.noSender
      ? [reason('simulate', 'SIM_NO_SENDER', 'warn', 'I could not simulate this transaction because I do not know which wallet signs it. Add your address.')]
      : []
    return { check: 'simulate', status: 'skipped', reasons }
  }
  if (!outcome.facts) {
    return { check: 'simulate', status: 'failed', reasons: [sourceFailed('simulate', 'what this transaction would do (the simulation did not run)')] }
  }
  const f = outcome.facts
  const who = actor ?? f.sender
  const reasons: Reason[] = []
  if (f.status === 'reverted') {
    const why = f.revertReason ? `: ${safeText(f.revertReason, 120)}` : ''
    reasons.push(reason('simulate', 'SIM_REVERTED', 'warn', f.source === 'executed' ? 'This transaction failed on-chain.' : `This transaction would fail if sent now${why}.`))
  }
  const deltas = netDeltas(f.movements, who)
  const outs = deltas.filter((d) => d.amount < 0n)
  const ins = deltas.filter((d) => d.amount > 0n)
  if (outs.length > 0 && ins.length === 0) {
    if (f.source === 'executed' && f.sender !== who) {
      reasons.push(reason('simulate', 'SIM_ASSET_OUT_NO_IN', 'danger', `Someone else (${short(f.sender)}) moved assets out of your wallet in this transaction: ${describe(outs)}.`))
    } else if (!isPlainSend(action, who, outs)) {
      // Same rule for a tx the user is about to sign and one the user already sent (post-mortem: "was I drained?").
      const soft = partyClass(txTo) === 'verified' && !isYoung(txTo, now)
      const text = f.source === 'executed'
        ? `Assets left your wallet and nothing came back: ${describe(outs)}.`
        : `Assets leave your wallet and nothing comes back: ${describe(outs)}.`
      reasons.push(reason('simulate', 'SIM_ASSET_OUT_NO_IN', soft ? 'warn' : 'danger', text))
    } else {
      reasons.push(reason('simulate', 'SIM_SEND', 'ok', `You send ${describe(outs)}.`))
    }
  } else if (deltas.length > 0) {
    const give = outs.length ? `You send ${describe(outs)}` : 'You send nothing'
    reasons.push(reason('simulate', 'SIM_BALANCE_CHANGES', 'ok', `${give}; you receive ${describe(ins)}.`))
  } else if (f.status === 'success') {
    reasons.push(reason('simulate', 'SIM_NO_BALANCE_CHANGE', 'ok', 'No ETH or tokens leave or enter your wallet in this transaction.'))
  }
  return { check: 'simulate', status: 'ok', reasons }
}
