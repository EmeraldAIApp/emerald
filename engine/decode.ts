import { decodeFunctionData, encodeFunctionData, formatEther, parseAbi, parseAbiItem, type Abi, type AbiFunction } from 'viem'
import { isYoung, partyClass, type AccountFacts } from './accounts.js'
import { KNOWN_SPENDERS, MAX_UINT256, UNLIMITED, ZERO } from './known.js'
import type { OpenchainSig } from './sources/raw-types.js'
import type { Action, CheckResult, Hex, Reason, Sources, Subject, TxLike, TypedDataInput } from './types.js'
import { addressUrl, lower, reason, safeText, short, sourceFailed, toBigInt } from './util.js'

export interface DecodeOutcome {
  action: Action
  notes: Reason[]
  failed: boolean
  applicable: boolean
}

// Standard functions: decoded without network. approve with 4 args = Permit2.approve(token, spender, amount, expiration).
const KNOWN_ABI = parseAbi([
  'function approve(address spender, uint256 amount)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function increaseAllowance(address spender, uint256 addedValue)',
  'function setApprovalForAll(address operator, bool approved)',
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
])

export const isUnlimited = (x: bigint) => x >= UNLIMITED

const done = (action: Action, notes: Reason[] = [], failed = false): DecodeOutcome => ({ action, notes, failed, applicable: true })

/** Takes the first openchain candidate that round-trips exactly (filter=true does not filter out all the junk). */
export function decodeWithCandidates(data: Hex, sigs: OpenchainSig[]): { signature: string; functionName: string; ambiguous: boolean } | null {
  for (const s of sigs) {
    try {
      const item = parseAbiItem(`function ${s.name}`) as AbiFunction
      const dec = decodeFunctionData({ abi: [item], data })
      if (encodeFunctionData({ abi: [item], functionName: dec.functionName, args: dec.args }) === data.toLowerCase()) {
        return { signature: s.name, functionName: dec.functionName, ambiguous: sigs.length > 1 }
      }
    } catch {
      // next candidate
    }
  }
  return null
}

async function tokenStandard(token: Hex, sources: Sources): Promise<{ standard: 'erc20' | 'erc721'; failed: boolean }> {
  try {
    const t = await sources.blockscout.getToken(token)
    return { standard: t?.type === 'ERC-721' ? 'erc721' : 'erc20', failed: false }
  } catch {
    return { standard: 'erc20', failed: true }
  }
}

async function decodeTx(tx: TxLike, sources: Sources): Promise<DecodeOutcome> {
  if (tx.data.length < 10) {
    return done({ type: 'nativeTransfer', to: tx.to, value: tx.value }, [
      reason('decode', 'NATIVE_TRANSFER', 'ok', `Sends ${formatEther(tx.value)} ETH to ${short(tx.to)}.`, addressUrl(tx.to)),
    ])
  }
  let known: { functionName: string; args: readonly unknown[] } | null = null
  try {
    const d = decodeFunctionData({ abi: KNOWN_ABI, data: tx.data })
    known = { functionName: d.functionName, args: (d.args ?? []) as readonly unknown[] }
  } catch {
    known = null
  }
  if (known) return classifyKnown(tx, known, sources)
  return decodeGeneric(tx, sources)
}

async function classifyKnown(tx: TxLike, k: { functionName: string; args: readonly unknown[] }, sources: Sources): Promise<DecodeOutcome> {
  const [a0, a1, a2] = k.args
  const addr = (v: unknown) => lower(String(v))
  switch (k.functionName) {
    case 'approve': {
      if (k.args.length === 4) {
        const amount = a2 as bigint
        return done({ type: 'permit', via: 'permit2', tokens: [addr(a0)], spender: addr(a1), maxAmount: amount, unlimited: isUnlimited(amount) }, [
          reason('decode', 'DECODED', 'ok', `Permit2.approve: lets ${short(addr(a1))} spend token ${short(addr(a0))}.`),
        ])
      }
      const std = await tokenStandard(tx.to, sources)
      return done({ type: 'approve', token: tx.to, standard: std.standard, spender: addr(a0), amount: a1 as bigint }, [], std.failed)
    }
    case 'increaseAllowance':
      return done({ type: 'approve', token: tx.to, standard: 'erc20', spender: addr(a0), amount: a1 as bigint })
    case 'setApprovalForAll':
      return done({ type: 'approvalForAll', token: tx.to, operator: addr(a0), approved: a1 as boolean })
    case 'transfer':
      return done({ type: 'tokenTransfer', token: tx.to, standard: 'erc20', from: null, to: addr(a0), amount: a1 as bigint }, [
        reason('decode', 'DECODED', 'ok', `Token transfer of ${a1 as bigint} raw units of ${short(tx.to)} to ${short(addr(a0))}.`, addressUrl(addr(a0))),
      ])
    case 'transferFrom': {
      const std = await tokenStandard(tx.to, sources)
      const amount = std.standard === 'erc721' ? 1n : (a2 as bigint)
      return done({ type: 'tokenTransfer', token: tx.to, standard: std.standard, from: addr(a0), to: addr(a1), amount }, [
        reason('decode', 'DECODED', 'ok', `transferFrom ${short(addr(a0))} to ${short(addr(a1))} on ${short(tx.to)}.`),
      ], std.failed)
    }
    default: // safeTransferFrom (ERC-721)
      return done({ type: 'tokenTransfer', token: tx.to, standard: 'erc721', from: addr(a0), to: addr(a1), amount: 1n }, [
        reason('decode', 'DECODED', 'ok', `NFT transfer from ${short(addr(a0))} to ${short(addr(a1))}.`),
      ])
  }
}

async function decodeGeneric(tx: TxLike, sources: Sources): Promise<DecodeOutcome> {
  const selector = tx.data.slice(0, 10) as Hex
  let failed = false
  try {
    const r = await sources.sourcify.resolvedAbi(tx.to)
    if (r) {
      try {
        const d = decodeFunctionData({ abi: r.abi as unknown as Abi, data: tx.data })
        return done({ type: 'call', to: tx.to, functionName: d.functionName, decodedWith: 'sourcify' }, [
          reason('decode', 'DECODED', 'ok', `Calls ${safeText(d.functionName)}() on the verified contract ${short(tx.to)}.`, addressUrl(tx.to)),
        ])
      } catch {
        // the selector is not in the ABI: try openchain
      }
    }
  } catch {
    failed = true
  }
  try {
    const sigs = (await sources.openchain.lookupFunctions([selector]))[selector] ?? null
    const hit = sigs && sigs.length > 0 ? decodeWithCandidates(tx.data, sigs) : null
    if (hit) {
      const amb = hit.ambiguous ? ' (several names share this selector)' : ''
      return done({ type: 'call', to: tx.to, functionName: hit.functionName, decodedWith: 'openchain' }, [
        reason('decode', 'DECODED', 'ok', `Calls ${safeText(hit.signature)} on ${short(tx.to)}, name from the openchain signature database${amb}.`, addressUrl(tx.to)),
      ])
    }
  } catch {
    failed = true
  }
  const notes = [reason('decode', 'DECODE_UNKNOWN_FUNCTION', 'warn', `I could not decode function ${selector} on ${short(tx.to)}.`, addressUrl(tx.to))]
  return done({ type: 'call', to: tx.to, functionName: null, decodedWith: null }, notes, failed)
}

function decodeTypedData(td: TypedDataInput): DecodeOutcome {
  const notes: Reason[] = []
  const chainId = toBigInt(td.domain.chainId)
  if (chainId !== null && chainId !== 1n) {
    notes.push(reason('decode', 'TYPED_DATA_OTHER_CHAIN', 'warn', `This signature is for chain id ${chainId}. Emerald only checks Ethereum mainnet.`))
  }
  const name = typeof td.domain.name === 'string' ? td.domain.name : ''
  const m = td.message
  const asAddr = (v: unknown): Hex | null => (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) ? lower(v) : null)
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v])
  const field = (o: unknown, k: string): unknown => (typeof o === 'object' && o !== null ? (o as Record<string, unknown>)[k] : undefined)

  if (name === 'Permit2' && (m.details !== undefined || m.permitted !== undefined)) {
    const items = m.details !== undefined ? list(m.details) : list(m.permitted)
    const tokens = items.map((i) => asAddr(field(i, 'token')))
    const amounts = items.map((i) => toBigInt(field(i, 'amount')))
    const spender = asAddr(m.spender)
    if (spender && tokens.length > 0 && tokens.every((t) => t !== null) && amounts.every((a) => a !== null)) {
      const maxAmount = (amounts as bigint[]).reduce((a, b) => (b > a ? b : a), 0n)
      return done({ type: 'permit', via: 'permit2', tokens: tokens as Hex[], spender, maxAmount, unlimited: isUnlimited(maxAmount) }, [
        ...notes,
        reason('decode', 'DECODED', 'ok', `Permit2 signature (${safeText(td.primaryType)}): lets ${short(spender)} spend ${tokens.length} token(s).`, addressUrl(spender)),
      ])
    }
  }
  if (td.primaryType === 'Permit') {
    const spender = asAddr(m.spender)
    const token = asAddr(td.domain.verifyingContract)
    const amount = m.allowed === true ? MAX_UINT256 : toBigInt(m.value)
    if (spender && token && amount !== null) {
      return done({ type: 'permit', via: 'eip2612', tokens: [token], spender, maxAmount: amount, unlimited: isUnlimited(amount) }, [
        ...notes,
        reason('decode', 'DECODED', 'ok', `Permit signature: lets ${short(spender)} spend token ${short(token)}.`, addressUrl(spender)),
      ])
    }
  }
  if (name === 'Seaport' && td.primaryType === 'OrderComponents') {
    const offerer = asAddr(m.offerer)
    const offer = list(m.offer)
    const consideration = list(m.consideration)
    const positive = (i: unknown) => (toBigInt(field(i, 'startAmount')) ?? 0n) > 0n || (toBigInt(field(i, 'endAmount')) ?? 0n) > 0n
    const itemsToOfferer = consideration.filter((c) => offerer !== null && asAddr(field(c, 'recipient')) === offerer && positive(c)).length
    return done({ type: 'seaport', offerer, offerItems: offer.length, itemsToOfferer }, notes)
  }
  notes.push(reason('decode', 'TYPED_DATA_UNKNOWN', 'warn', `Unrecognized signature type "${safeText(td.primaryType)}"${name ? ` for "${safeText(name)}"` : ''}. Emerald cannot tell what it authorizes.`))
  return done({ type: 'typedDataUnknown', primaryType: td.primaryType }, notes)
}

/** What the input does. It applies no rules: decodeCheck does that with the account facts. */
export async function decodeAction(subject: Subject, sources: Sources): Promise<DecodeOutcome> {
  switch (subject.kind) {
    case 'address':
      return { action: { type: 'none' }, notes: [], failed: false, applicable: false }
    case 'unsupported':
      return { action: { type: 'none' }, notes: [subject.reason], failed: subject.failed, applicable: true }
    case 'typedData':
      return decodeTypedData(subject.typedData)
    case 'tx':
      return decodeTx(subject.tx, sources)
  }
}

/** Spender or operator of the action (for labels and poisoning). */
export function spenderOf(a: Action): Hex | null {
  if (a.type === 'approve' || a.type === 'permit') return a.spender
  if (a.type === 'approvalForAll') return a.operator
  return null
}

/** Spec §2 rules for approvals, permits and Seaport. */
export function decodeCheck(o: DecodeOutcome, accounts: Map<Hex, AccountFacts>, now: Date): CheckResult {
  if (!o.applicable) return { check: 'decode', status: 'skipped', reasons: [] }
  const reasons = [...o.notes]
  let failed = o.failed
  const a = o.action
  switch (a.type) {
    case 'approve': {
      const p = partyClass(accounts.get(a.spender))
      const who = short(a.spender)
      const url = addressUrl(a.spender)
      // An ERC-721 approve carries a tokenId in `amount` (token #0 exists), so only the zero address revokes it; only ERC-20 amount 0 does.
      const revoke = a.standard === 'erc721' ? a.spender === ZERO : a.amount === 0n
      if (revoke && a.standard === 'erc721') reasons.push(reason('decode', 'APPROVE_REVOKE', 'ok', `Clears the approval of NFT #${a.amount} of ${short(a.token)}.`, addressUrl(a.token)))
      else if (revoke) reasons.push(reason('decode', 'APPROVE_REVOKE', 'ok', `Removes the approval of ${who}.`, url))
      else if (p === 'unknown') failed = true
      else if (a.standard === 'erc721') {
        if (p === 'verified') reasons.push(reason('decode', 'APPROVE_NFT', 'ok', `Lets the verified contract ${who} move NFT #${a.amount} of ${short(a.token)}.`, url))
        else reasons.push(reason('decode', 'APPROVE_EOA', 'warn', `Lets ${who} (${p === 'eoa' ? 'a wallet' : 'an unverified contract'}) take NFT #${a.amount} of ${short(a.token)}.`, url))
      } else if (isUnlimited(a.amount)) {
        if (p === 'eoa') reasons.push(reason('decode', 'APPROVE_UNLIMITED_EOA', 'danger', `Gives a wallet (${who}) unlimited access to your ${short(a.token)} tokens.`, url))
        else if (p === 'unverified') reasons.push(reason('decode', 'APPROVE_UNLIMITED_UNVERIFIED', 'danger', `Gives an unverified contract (${who}) unlimited access to your ${short(a.token)} tokens.`, url))
        else reasons.push(reason('decode', 'APPROVE_UNLIMITED_VERIFIED', 'warn', `Unlimited approval to the verified contract ${who}. Approving only the amount you need is safer.`, url))
      } else if (p === 'eoa') {
        reasons.push(reason('decode', 'APPROVE_EOA', 'warn', `Lets a wallet (${who}) spend ${a.amount} raw units of ${short(a.token)}.`, url))
      } else {
        reasons.push(reason('decode', 'APPROVE_LIMITED', 'ok', `Approves ${a.amount} raw units of ${short(a.token)} to ${who}.`, url))
      }
      break
    }
    case 'approvalForAll': {
      const p = partyClass(accounts.get(a.operator))
      const who = short(a.operator)
      const url = addressUrl(a.operator)
      if (!a.approved) reasons.push(reason('decode', 'APPROVE_REVOKE', 'ok', `Removes the operator ${who}.`, url))
      else if (p === 'unknown') failed = true
      else if (p === 'eoa') reasons.push(reason('decode', 'APPROVAL_FOR_ALL_EOA', 'danger', `Gives a wallet (${who}) control of ALL your items in collection ${short(a.token)}.`, url))
      else if (p === 'unverified') reasons.push(reason('decode', 'APPROVAL_FOR_ALL_UNVERIFIED', 'danger', `Gives an unverified contract (${who}) control of ALL your items in ${short(a.token)}.`, url))
      else reasons.push(reason('decode', 'APPROVAL_FOR_ALL_VERIFIED', 'warn', `Gives the verified contract ${who} control of all your items in ${short(a.token)}.`, url))
      break
    }
    case 'permit': {
      const f = accounts.get(a.spender)
      const p = partyClass(f)
      const who = short(a.spender)
      const url = addressUrl(a.spender)
      const listed = KNOWN_SPENDERS.has(a.spender)
      const code = a.via === 'permit2' ? 'PERMIT2_UNKNOWN_SPENDER' : 'PERMIT_UNKNOWN_SPENDER'
      if (!listed && p === 'unknown') failed = true
      else if (!listed && (p !== 'verified' || isYoung(f, now))) {
        const what = p === 'eoa' ? 'a wallet, not a known protocol' : p === 'unverified' ? 'an unverified contract' : 'a contract created less than 7 days ago'
        reasons.push(reason('decode', code, 'danger', `This signature lets ${who} (${what}) move your tokens.`, url))
      } else if (a.unlimited) {
        reasons.push(reason('decode', 'APPROVE_UNLIMITED_VERIFIED', 'warn', `Unlimited permit to ${listed ? KNOWN_SPENDERS.get(a.spender) : `the verified contract ${who}`}. A smaller amount is safer.`, url))
      } else {
        reasons.push(reason('decode', 'PERMIT_LIMITED', 'ok', `Limited permit to ${who}.`, url))
      }
      break
    }
    case 'seaport':
      if (a.offerItems > 0 && a.itemsToOfferer === 0) {
        reasons.push(reason('decode', 'SEAPORT_NOTHING_BACK', 'danger', 'This Seaport order gives away your items and pays you nothing.'))
      } else {
        // Never ok: a listing at a ridiculous price (1 wei for an NFT) is a real phishing pattern, and the engine has no prices.
        reasons.push(reason('decode', 'SEAPORT_LISTING', 'warn', `Seaport order: you offer ${a.offerItems} item(s) and receive ${a.itemsToOfferer} payment item(s). Emerald cannot price this order: verify the sale price and the marketplace.`))
      }
      break
    default:
      break
  }
  // An unresolvable hash already carries its own SOURCE_FAILED note: do not repeat it.
  if (failed && !reasons.some((r) => r.code === 'SOURCE_FAILED')) reasons.push(sourceFailed('decode', 'what this input does or who receives the permission'))
  return { check: 'decode', status: failed ? 'failed' : 'ok', reasons }
}
