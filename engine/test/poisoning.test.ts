import { describe, expect, it } from 'vitest'
import { buildHistory, gatherHistory, lookalikeKey, poisoningCheck, type History, type HistoryEntry } from '../poisoning.js'
import type { BlockscoutPage, BlockscoutTokenTransfer, BlockscoutTransaction } from '../sources/raw-types.js'
import type { Hex } from '../types.js'
import { raw } from './helpers/fixtures.js'
import { stubSources } from './helpers/stub-sources.js'

const VICTIM = '0x1e227979f0b5bc691a70deaed2e0f39a6f538fd5' as Hex
const LEGIT = '0xd9a1b0b1e1ae382dbdc898ea68012ffcb2853a91' as Hex
const POISONER = '0xd9a1c3788d81257612e2581a6ea0ada244853a91' as Hex
const CYRILLIC_LOOKALIKE = '0xd9a192566e41e0804c3d81588a2d15be58853a91' as Hex

// The victim's real history (2 pages of token-transfers + 1 page of sent txs).
const transfers = [
  ...raw<BlockscoutPage<BlockscoutTokenTransfer>>('blockscout-token-transfers-poisoning-victim-page1').items,
  ...raw<BlockscoutPage<BlockscoutTokenTransfer>>('blockscout-token-transfers-poisoning-victim-page2').items,
]
const txs = raw<BlockscoutPage<BlockscoutTransaction>>('blockscout-transactions-poisoning-victim-filter-from').items
const realEntries = buildHistory(VICTIM, txs, transfers)
// Page 2 of /transactions (not recorded as raw) has the real 0.05 ETH send to the legit address: 2024-05-03T09:14:47Z.
const legitSend: HistoryEntry = { counterparty: LEGIT, at: Date.parse('2024-05-03T09:14:47Z'), genuine: true }
const full: History = { entries: [...realEntries, legitSend], truncated: true }

const codes = (r: { reasons: { code: string; severity: string }[] }) => r.reasons.map((x) => `${x.code}:${x.severity}`)
const run = (counterparty: Hex, history: History, isRecipient = true) =>
  poisoningCheck({ user: VICTIM, counterparty, isRecipient, outcome: { history, error: null } })

describe('buildHistory (real victim data)', () => {
  it('the planted fake transfer to the poisoner is NOT genuine; the theft is', () => {
    const p = realEntries.filter((e) => e.counterparty === POISONER)
    expect(p.find((e) => e.at === Date.parse('2024-05-03T09:17:35Z'))?.genuine).toBe(false)
    expect(p.find((e) => e.at === Date.parse('2024-05-03T10:31:35Z'))?.genuine).toBe(true)
  })
  it('the Cyrillic WBTC spoof counterparty only appears as non-genuine', () => {
    const c = realEntries.filter((e) => e.counterparty === CYRILLIC_LOOKALIKE)
    expect(c.length).toBeGreaterThan(0)
    expect(c.every((e) => !e.genuine)).toBe(true)
  })
  it('the three share the look-alike key d9a1…3a91', () => {
    expect(new Set([LEGIT, POISONER, CYRILLIC_LOOKALIKE].map(lookalikeKey))).toEqual(new Set(['d9a13a91']))
  })
})

describe('poisoningCheck', () => {
  it('flagged poisoner (the real 68M theft destination) -> POISONING_LOOKALIKE danger', () => {
    const r = run(POISONER, full)
    expect(codes(r)).toEqual(['POISONING_LOOKALIKE:danger'])
    expect(r.reasons[0]!.text).toContain(LEGIT.slice(0, 6))
  })
  it('unflagged Cyrillic look-alike -> POISONING_LOOKALIKE danger', () => {
    expect(codes(run(CYRILLIC_LOOKALIKE, full))).toEqual(['POISONING_LOOKALIKE:danger'])
  })
  it('the real counterparty -> only a warning to compare the full address', () => {
    expect(codes(run(LEGIT, full))).toEqual(['POISONING_LOOKALIKE_IN_HISTORY:warn'])
  })
  it('first time sending to a fresh address -> FIRST_INTERACTION warn; not for approvals', () => {
    const fresh = '0x3bfa437f9d5c0318ca78668836a15f528497d76f' as Hex
    expect(codes(run(fresh, full))).toEqual(['FIRST_INTERACTION:warn'])
    expect(codes(run(fresh, full, false))).toEqual(['POISONING_CLEAR:ok'])
  })
  it('no user or no counterparty -> skipped; history unavailable -> failed', () => {
    expect(poisoningCheck({ user: null, counterparty: LEGIT, isRecipient: true, outcome: null }).status).toBe('skipped')
    const f = poisoningCheck({ user: VICTIM, counterparty: LEGIT, isRecipient: true, outcome: { history: null, error: 'blockscout/timeout' } })
    expect(f.status).toBe('failed')
    expect(codes(f)).toEqual(['SOURCE_FAILED:warn'])
  })
  // R1: without the user's address the look-alike comparison cannot run, so the verdict must not look complete.
  it('a value recipient without a user address -> skipped with a POISONING_NO_USER warning (never silent)', () => {
    const r = poisoningCheck({ user: null, counterparty: LEGIT, isRecipient: true, outcome: null })
    expect(r.check).toBe('poisoning')
    expect(r.status).toBe('skipped')
    expect(codes(r)).toEqual(['POISONING_NO_USER:warn'])
    expect(r.reasons[0]!.check).toBe('poisoning')
    expect(r.reasons[0]!.text).toBe(
      "I couldn't compare this address with your history. Connect your wallet or paste your own address to check for look-alikes.",
    )
  })
  it('no user, but nothing to compare (approvals, no counterparty, or the user themselves) -> skipped with no reasons', () => {
    expect(poisoningCheck({ user: null, counterparty: LEGIT, isRecipient: false, outcome: null }).reasons).toEqual([])
    expect(poisoningCheck({ user: null, counterparty: null, isRecipient: true, outcome: null }).reasons).toEqual([])
    const self = poisoningCheck({ user: VICTIM, counterparty: VICTIM, isRecipient: true, outcome: null })
    expect(self.status).toBe('skipped')
    expect(self.reasons).toEqual([])
  })
})

describe('gatherHistory', () => {
  it('asks for outgoing txs (filter=from) and ERC-20 transfers, 2 pages each', async () => {
    const calls: string[] = []
    const s = stubSources({
      blockscout: {
        getTransactions: async (a, o) => { calls.push(`txs ${a} ${o?.filter} ${o?.maxPages}`); return { items: txs, truncated: true } },
        getTokenTransfers: async (a, o) => { calls.push(`tt ${a} ${o?.maxPages}`); return { items: transfers, truncated: true } },
      },
    })
    const h = await gatherHistory(VICTIM, s)
    expect(calls.sort()).toEqual([`tt ${VICTIM} 2`, `txs ${VICTIM} from 2`])
    expect(h.history?.truncated).toBe(true)
  })
  it('never throws', async () => {
    expect((await gatherHistory(VICTIM, stubSources())).history).toBeNull()
  })
})
