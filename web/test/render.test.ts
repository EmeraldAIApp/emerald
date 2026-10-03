import { describe, expect, it } from 'vitest'
import { IDLE, reduce, type ChatState } from '../src/chat/machine.js'
import { EXPLAIN_FAILED, explainText, renderChecks, renderMini, renderScreen } from '../src/chat/render.js'
import type { WireVerdict } from '../src/chat/wire.js'
import { RED, YELLOW_FAILED } from './fixtures.js'

const opts = { canSignIn: false }
const verdictState = (v: WireVerdict, explanation = '', streaming = false): ChatState => ({
  kind: 'verdict', input: 'x', verdict: v, explanation, streaming, llmFailed: false, usage: null,
})

describe('renderScreen', () => {
  it('idle shows Ready', () => {
    const html = renderScreen(IDLE, opts)
    expect(html).toContain('Nothing checked yet')
    expect(html).toContain('dv__verdict is-idle')
    expect(html).toContain('Ready.')
    expect(html).toContain('Paste something below, or try one of these real cases.')
  })

  it('checking previews the paste escaped and shows the case note', () => {
    const html = renderScreen({ kind: 'checking', input: '<script>x</script>' }, { canSignIn: false, note: 'Real case.' })
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Real case.')
    expect(html).toContain('is-busy')
  })

  it('verdict: title, colored headline, danger reasons with https links, couldnt-check row', () => {
    const html = renderScreen(verdictState(RED, 'Because.'), opts)
    expect(html).toContain('<th scope="col">Permit2 signature request</th>')
    expect(html).toContain('dv__verdict is-red')
    expect(html).toContain('Don’t sign.')
    expect(html).toContain('class="sev-danger"')
    expect(html).not.toContain('USDC is verified.') // ok reasons are hidden when there is danger/warn
    expect(html).toContain('href="https://eth.blockscout.com/address/0x00001f78189bE22C3498cFF1B8e02272C3220000"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('aria-busy="false">Because.</td>')
    expect(html).toContain('Couldn’t check: nothing.')
  })

  it('escapes engine and LLM text and drops unsafe evidence links', () => {
    const evil: WireVerdict = {
      ...RED,
      reasons: [{ code: 'X', check: 'labels', severity: 'danger', text: '<b>x</b>', evidenceUrl: 'javascript:alert(1)' }],
    }
    const html = renderScreen(verdictState(evil, '<img src=x onerror=alert(1)>'), opts)
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<img')
  })

  it('green verdicts show their ok reasons', () => {
    const green: WireVerdict = { ...RED, level: 'green', headline: 'Looks fine.', reasons: [{ code: 'OK', check: 'labels', severity: 'ok', text: 'No flags.' }] }
    const html = renderScreen(verdictState(green), opts)
    expect(html).toContain('dv__verdict is-green')
    expect(html).toContain('No flags.')
  })

  it('streaming without text shows an ellipsis; a failed explanation says so', () => {
    expect(explainText(verdictState(RED, '', true))).toBe('…')
    const failed: ChatState = { ...(verdictState(RED) as Extract<ChatState, { kind: 'verdict' }>), llmFailed: true }
    expect(explainText(failed)).toBe(EXPLAIN_FAILED)
    expect(renderScreen(failed, opts)).toContain(EXPLAIN_FAILED)

    // The engine row (dv__couldnt) is the only "Couldn't check" line: the model's closing line is hidden, also while it streams.
    expect(explainText(verdictState(RED, "Because.\nCouldn't check: a simulation."))).toBe('Because.')
    expect(explainText(verdictState(RED, 'Because.\nCouldn’t check: nothing.', true))).toBe('Because.')
    expect(explainText(verdictState(RED, 'Couldn’t check: nothing.', true))).toBe('…')
    expect(explainText(verdictState(RED, 'It says Couldn’t check: in the middle.'))).toBe('It says Couldn’t check: in the middle.')
    const html = renderScreen(verdictState(RED, 'Because.\nCouldn’t check: a simulation.'), opts)
    expect(html.match(/Couldn’t check:/g)?.length).toBe(1)
    expect(html).not.toContain('a simulation')
  })

  it('errors and quota states', () => {
    expect(renderScreen({ kind: 'error', input: 'x', error: 'bad_input' }, opts)).toContain('That doesn’t look like a transaction, signature, address or token.')
    expect(renderScreen({ kind: 'error', input: 'x', error: 'network' }, opts)).toContain('Couldn’t reach the checker. Try again in a minute.')
    const quota: ChatState = { kind: 'quota', input: 'x', reason: 'quota', tier: 'anon', limit: 5, resetAt: '2026-10-01T00:00:00.000Z' }
    expect(renderScreen(quota, opts)).toContain('You’ve used your 5 checks for today. More at 00:00 UTC.')
    expect(renderScreen(quota, opts)).not.toContain('data-action="signin"')
    expect(renderScreen(quota, { canSignIn: true })).toContain('data-action="signin"')
    const paused: ChatState = { ...quota, reason: 'paused' }
    expect(renderScreen(paused, opts)).toContain('Free checks are paused for today.')
    expect(renderScreen(paused, opts)).toContain('Today’s budget for free checks is used up. Back at 00:00 UTC.')
    expect(renderScreen({ ...quota, limit: null }, opts)).toContain('You’ve used today’s free checks.')
    expect(renderScreen({ ...quota, limit: null }, opts)).toContain('You’ve used your checks for today. More at 00:00 UTC.')
    expect(renderScreen({ kind: 'error', input: 'x', error: 'server' }, opts)).toContain('Something went wrong on our side. Try again.')
  })
})

describe('renderMini and renderChecks', () => {
  it('mini repeats the verdict headline and level', () => {
    expect(renderMini(IDLE)).toEqual({ level: 'idle', text: 'Ready.' })
    expect(renderMini(verdictState(RED))).toEqual({ level: 'red', text: 'Don’t sign.' })
    expect(renderMini({ kind: 'quota', input: 'x', reason: 'paused', tier: null, limit: null, resetAt: null })).toEqual({ level: 'idle', text: 'Paused.' })
  })

  it('checks table has the five checks in order plus the verdict row', () => {
    const html = renderChecks(verdictState(YELLOW_FAILED))
    const order = ['decode', 'simulate', 'poisoning', 'labels', 'token'].map((c) => html.indexOf(`<b>${c}</b>`))
    expect(order.every((i) => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain('dv__check is-warn')
    expect(html).toContain('dv__check is-failed')
    expect(html).toContain('dv__verdict is-yellow')
    const idle = renderChecks(reduce(IDLE, { type: 'reset' }))
    expect(idle).toContain('Waiting for a paste')
    expect(idle.match(/is-waiting/g)?.length).toBe(5)
  })
})
