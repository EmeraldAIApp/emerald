import { describe, expect, it } from 'vitest'
import { score } from '../score.js'
import type { CheckResult, ParsedInput } from '../types.js'
import { reason } from '../util.js'

const tx: ParsedInput = { kind: 'tx', tx: { to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', data: '0x', value: 0n } }
const addr: ParsedInput = { kind: 'address', address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' }
const ok = (check: CheckResult['check']): CheckResult => ({ check, status: 'ok', reasons: [reason(check, 'X_OK', 'ok', 'fine')] })

describe('score', () => {
  it('all ok -> green "Looks fine."', () => {
    const s = score([ok('decode'), ok('simulate'), ok('labels'), { check: 'token', status: 'skipped', reasons: [] }], tx, {})
    expect(s).toMatchObject({ level: 'green', headline: 'Looks fine.', checksOk: ['decode', 'simulate', 'labels'], checksFailed: [] })
  })

  it('any danger -> red; tx says "Don\'t sign.", address says "Don\'t send."', () => {
    const bad: CheckResult = { check: 'labels', status: 'ok', reasons: [reason('labels', 'LABEL_FLAGGED_GOPLUS', 'danger', 'bad')] }
    expect(score([ok('decode'), bad], tx, {})).toMatchObject({ level: 'red', headline: "Don't sign." })
    expect(score([bad], addr, {})).toMatchObject({ level: 'red', headline: "Don't send." })
  })

  it('a warning -> yellow', () => {
    const w: CheckResult = { check: 'poisoning', status: 'ok', reasons: [reason('poisoning', 'FIRST_INTERACTION', 'warn', 'new')] }
    expect(score([ok('decode'), w], tx, {})).toMatchObject({ level: 'yellow', headline: 'Check before you sign.' })
  })

  it('a failed check forces yellow even with no warn reason (never green with missing data)', () => {
    const failed: CheckResult = { check: 'simulate', status: 'failed', reasons: [] }
    expect(score([ok('decode'), failed], tx, {})).toMatchObject({ level: 'yellow', checksFailed: ['simulate'] })
  })

  it('reasons are ordered danger > warn > ok, stable inside each severity', () => {
    const r: CheckResult = {
      check: 'labels', status: 'ok',
      reasons: [reason('labels', 'A', 'ok', 'a'), reason('labels', 'B', 'warn', 'b'), reason('labels', 'C', 'danger', 'c'), reason('labels', 'D', 'warn', 'd')],
    }
    expect(score([r], tx, {}).reasons.map((x) => x.code)).toEqual(['C', 'B', 'D', 'A'])
  })

  it('own token CA -> green "This is me." despite a warning (e.g. CONTRACT_NEW); still red on danger, yellow on failure', () => {
    const young: CheckResult = { check: 'labels', status: 'ok', reasons: [reason('labels', 'CONTRACT_NEW', 'warn', 'new')] }
    const self = { selfTokenAddress: '0x5AAEB6053f3e94c9b9a09f33669435e7ef1beaed' as const }
    expect(score([young], addr, self)).toMatchObject({ level: 'green', headline: 'This is me.' })
    expect(score([young, { check: 'token', status: 'failed', reasons: [] }], addr, self)).toMatchObject({ level: 'yellow' })
    const bad: CheckResult = { check: 'token', status: 'ok', reasons: [reason('token', 'TOKEN_CANNOT_SELL', 'danger', 'x')] }
    expect(score([bad], addr, self)).toMatchObject({ level: 'red' })
  })
})
