import { describe, expect, it } from 'vitest'
import { checkRow, couldntCheck, esc, ethFromWei, preview, quotaLine, resetClock, safeUrl, shortHex, titleFor, typo, usd } from '../src/chat/format.js'
import type { WireVerdict } from '../src/chat/wire.js'
import { RED, YELLOW_FAILED } from './fixtures.js'

describe('format', () => {
  it('esc neutralizes HTML', () => {
    expect(esc(`<img src=x onerror="a('b')">&`)).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;')
  })

  it('shortHex shortens long hex like the board and leaves the rest alone', () => {
    expect(shortHex('0x3f1c000000000000000000000000000000a9e2')).toBe('0x3f1c…a9e2')
    expect(shortHex('0xabc')).toBe('0xabc')
    expect(shortHex('vitalik.eth')).toBe('vitalik.eth')
  })

  it('typo curls apostrophes', () => {
    expect(typo("Don't sign.")).toBe('Don’t sign.')
  })

  it('safeUrl only lets https through', () => {
    expect(safeUrl('https://eth.blockscout.com/address/0x1')).toBe('https://eth.blockscout.com/address/0x1')
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('http://example.com')).toBeNull()
    expect(safeUrl('not a url')).toBeNull()
    expect(safeUrl(undefined)).toBeNull()
  })

  it('titleFor names each input kind', () => {
    expect(titleFor(RED.input)).toBe('Permit2 signature request')
    expect(titleFor(YELLOW_FAILED.input)).toBe('Transaction to 0x2260…C599')
    expect(titleFor({ kind: 'address', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' })).toBe('Address 0xd8dA…6045')
    expect(titleFor({ kind: 'txHash', hash: '0x020419afcdb33f575ba84361e3125b832c11a2d22fc187132a87a4b4baa02f8e' })).toBe('Transaction 0x0204…2f8e')
    expect(titleFor({ kind: 'unknown', raw: '?' })).toBe('Couldn’t read that')
    expect(titleFor({ kind: 'typedData', typedData: { domain: {}, types: {}, primaryType: 'Order', message: {} } })).toBe('Order signature request')
  })

  it("couldntCheck says nothing, or lists the failed checks", () => {
    expect(couldntCheck(RED)).toBe('Couldn’t check: nothing.')
    expect(couldntCheck(YELLOW_FAILED)).toBe('Couldn’t check: simulate, poisoning.')

    // A check that did not run (not in checksOk) and left a warn reason counts as not checked, even if it is not in checksFailed
    // (POISONING_NO_USER: a pasted address with no wallet connected).
    const noUser: WireVerdict = {
      ...RED,
      checksOk: ['decode', 'labels', 'token'],
      reasons: [{ code: 'POISONING_NO_USER', check: 'poisoning', severity: 'warn', text: 'I need your wallet to check poisoning.' }],
    }
    expect(couldntCheck(noUser)).toBe('Couldn’t check: poisoning.')
    // A warn on a check that did run is a finding, not a gap.
    const warnedButRan: WireVerdict = { ...RED, reasons: [{ code: 'CONTRACT_NEW', check: 'labels', severity: 'warn', text: 'New contract.' }] }
    expect(couldntCheck(warnedButRan)).toBe('Couldn’t check: nothing.')
    // Failed and warned on the same check: listed once.
    const both: WireVerdict = { ...YELLOW_FAILED, checksFailed: ['simulate'], reasons: [{ code: 'SOURCE_FAILED', check: 'simulate', severity: 'warn', text: 'x' }] }
    expect(couldntCheck(both)).toBe('Couldn’t check: simulate.')
  })

  it('checkRow derives each S3 row from the verdict only', () => {
    expect(checkRow(null, 'decode')).toEqual({ state: 'waiting', text: 'waiting' })
    expect(checkRow(RED, 'decode').state).toBe('danger')
    expect(checkRow(RED, 'token')).toEqual({ state: 'ok', text: 'USDC is verified.' })
    expect(checkRow(RED, 'poisoning')).toEqual({ state: 'ok', text: 'nothing found' })
    expect(checkRow(RED, 'simulate')).toEqual({ state: 'skipped', text: 'not needed here' })
    expect(checkRow(YELLOW_FAILED, 'simulate')).toEqual({ state: 'warn', text: 'The simulation source did not answer.' })
    expect(checkRow(YELLOW_FAILED, 'poisoning')).toEqual({ state: 'failed', text: 'couldn’t check' })
  })

  it('resetClock prints HH:MM UTC and falls back to midnight', () => {
    expect(resetClock('2026-10-01T00:00:00.000Z')).toBe('00:00 UTC')
    expect(resetClock('2026-10-01T13:05:00.000Z')).toBe('13:05 UTC')
    expect(resetClock(null)).toBe('00:00 UTC')
    expect(resetClock('garbage')).toBe('00:00 UTC')
  })

  it('quotaLine says how many free checks are left', () => {
    expect(quotaLine({ tier: 'anon', limit: 5, used: 2, resetAt: '2026-10-01T00:00:00.000Z' })).toBe('3 free checks left today.')
    expect(quotaLine({ tier: 'anon', limit: 5, used: 7, resetAt: '2026-10-01T00:00:00.000Z' })).toBe('You’ve used today’s free checks. More at 00:00 UTC.')
    expect(quotaLine({ tier: 'whale', limit: null, used: 40, resetAt: '2026-10-01T00:00:00.000Z' })).toBe('No daily limit.')
  })

  it('quotaLine uses the singular for one check left and the plural otherwise', () => {
    expect(quotaLine({ tier: 'anon', limit: 5, used: 4, resetAt: '2026-10-01T00:00:00.000Z' })).toBe('1 free check left today.')
    expect(quotaLine({ tier: 'anon', limit: 5, used: 2, resetAt: '2026-10-01T00:00:00.000Z' })).toBe('3 free checks left today.')
  })

  it('ethFromWei truncates to 3 decimals and survives garbage', () => {
    expect(ethFromWei('0')).toBe('0.000')
    expect(ethFromWei('1234500000000000000')).toBe('1.234')
    expect(ethFromWei('999999999999999')).toBe('0.000')
    expect(ethFromWei('12000000000000000000')).toBe('12.000')
    expect(ethFromWei('nope')).toBe('0.000')
    expect(ethFromWei('-5')).toBe('0.000')
  })

  it('usd and preview', () => {
    expect(usd(0.0112)).toBe('$0.01')
    expect(usd(Number.NaN)).toBe('$0.00')
    expect(preview('a\n  b')).toBe('a b')
    expect(preview('x'.repeat(200)).length).toBe(96)
  })
})

describe('compactHex', () => {
  it('shortens every address or hash inside a sentence', async () => {
    const { compactHex } = await import('../src/chat/format.js')
    expect(compactHex('Permit2 lets 0x00001f78189bE22C3498cFF1B8e02272C3220000 move USDC.')).toBe('Permit2 lets 0x0000…0000 move USDC.')
    expect(compactHex('tx 0x020419afcdb33f575ba84361e3125b832c11a2d22fc187132a87a4b4baa02f8e ok')).toBe('tx 0x0204…2f8e ok')
    expect(compactHex('no hex here 0x12')).toBe('no hex here 0x12')
  })
})
