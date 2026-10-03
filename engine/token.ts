import type { AccountFacts } from './accounts.js'
import { netDeltas, type SimulationOutcome } from './simulate.js'
import type { GoPlusTokenSecurity } from './sources/raw-types.js'
import type { CheckResult, Hex, Reason, Sources, Subject } from './types.js'
import { errorMessage, reason, safeText, short, sourceFailed } from './util.js'

export type TokenResults = Map<Hex, { data: GoPlusTokenSecurity | null; error: null } | { data: null; error: string }>

const tokenUrl = (a: string) => `https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=${a}`

/** Tokens to check: the pasted CA (if Blockscout says ERC-20) or the ERC-20s the user would receive (max 3). */
export function tokenTargets(subject: Subject, sim: SimulationOutcome, accounts: Map<Hex, AccountFacts>, actor: Hex | null): Hex[] {
  if (subject.kind === 'address') {
    const b = accounts.get(subject.address)?.blockscout
    return b?.isToken && b.tokenType === 'ERC-20' ? [subject.address] : []
  }
  if (subject.kind !== 'tx' || !sim.applicable || !sim.facts) return []
  const who = actor ?? sim.facts.sender
  return netDeltas(sim.facts.movements, who)
    .filter((d) => d.amount > 0n && d.standard === 'erc20')
    .map((d) => d.asset)
    .slice(0, 3)
}

export async function gatherTokens(targets: Hex[], sources: Sources): Promise<TokenResults> {
  const out: TokenResults = new Map()
  await Promise.all(
    targets.map(async (t) => {
      try {
        out.set(t, { data: await sources.goplus.tokenSecurity(t), error: null })
      } catch (e) {
        out.set(t, { data: null, error: errorMessage(e) })
      }
    }),
  )
  return out
}

/** Token rules (GoPlus token_security). A missing field means "unknown", never "ok". */
export function evaluateToken(token: Hex, t: GoPlusTokenSecurity | null): Reason[] {
  const who = `${t?.token_symbol ? `${safeText(t.token_symbol, 16)} ` : ''}(${short(token)})`
  const url = tokenUrl(token)
  if (!t) return [reason('token', 'TOKEN_UNKNOWN', 'warn', `GoPlus has no security data for token ${short(token)}.`, url)]
  const out: Reason[] = []
  // A sell tax GoPlus sends in another format (NaN) is unknown, never "no tax".
  const rawTax = t.sell_tax ? Number(t.sell_tax) : null
  const sellTax = rawTax !== null && Number.isFinite(rawTax) ? rawTax : null
  const taxUnreadable = rawTax !== null && sellTax === null
  if (t.is_honeypot === '1' || t.cannot_sell_all === '1') {
    out.push(reason('token', 'TOKEN_CANNOT_SELL', 'danger', `GoPlus says token ${who} cannot be sold (honeypot).`, url))
  } else if (sellTax !== null && sellTax >= 0.5) {
    out.push(reason('token', 'TOKEN_CANNOT_SELL', 'danger', `Token ${who} keeps ${Math.round(sellTax * 100)}% of every sale (sell tax).`, url))
  } else if (sellTax !== null && sellTax >= 0.05) {
    out.push(reason('token', 'TOKEN_SELL_TAX', 'warn', `Token ${who} charges a ${(sellTax * 100).toFixed(1)}% sell tax.`, url))
  }
  if (t.fake_token?.value === 1) {
    const real = typeof t.fake_token.true_token_address === 'string' ? ` (${short(t.fake_token.true_token_address)})` : ''
    out.push(reason('token', 'TOKEN_FAKE', 'danger', `GoPlus says ${who} imitates another token${real}.`, url))
  }
  if (t.honeypot_with_same_creator === '1') {
    out.push(reason('token', 'TOKEN_CREATOR_HONEYPOTS', 'warn', `The creator of ${who} has deployed honeypots before.`, url))
  }
  if (t.cannot_buy === '1') out.push(reason('token', 'TOKEN_CANNOT_BUY', 'warn', `Token ${who} cannot be bought right now.`, url))
  if ((t.is_honeypot === undefined && t.trust_list !== '1') || taxUnreadable) {
    out.push(reason('token', 'TOKEN_SELLABILITY_UNKNOWN', 'warn', `GoPlus could not tell whether ${who} can be sold.`, url))
  }
  if (out.length === 0) out.push(reason('token', 'TOKEN_OK', 'ok', `GoPlus: ${who} can be sold${sellTax ? `, sell tax ${(sellTax * 100).toFixed(1)}%` : ''}.`, url))
  return out
}

export function tokenCheck(targets: Hex[], results: TokenResults): CheckResult {
  if (targets.length === 0) return { check: 'token', status: 'skipped', reasons: [] }
  const reasons: Reason[] = []
  let failed = false
  for (const t of targets) {
    const r = results.get(t)
    if (!r || r.error !== null) {
      failed = true
      continue
    }
    reasons.push(...evaluateToken(t, r.data))
  }
  if (failed) reasons.push(sourceFailed('token', 'whether the token can be sold (GoPlus)'))
  return { check: 'token', status: failed ? 'failed' : 'ok', reasons }
}
