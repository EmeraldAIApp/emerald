// Chat state -> device-view HTML. Pure strings (testable without a DOM); all external data goes through esc().
import { checkRow, compactHex, type RowState, couldntCheck, esc, preview, resetClock, safeUrl, titleFor, typo } from './format.js'
import type { ChatState, ErrorKind } from './machine.js'
import { CHECKS, type CheckName, type Level, type WireVerdict } from './wire.js'

export interface ScreenOpts {
  /** There is a $EMERALD CA: Sign-In with Ethereum can be offered to move up a tier. */
  canSignIn: boolean
  /** Note of the real case when the check came from "Try a real case". */
  note?: string
  /** Show the 5 checks as a console log above the verdict (Emerald.exe). */
  log?: boolean
}

const head = (title: string) => `<thead><tr><th scope="col">${esc(title)}</th></tr></thead>`
const verdictRow = (level: Level | 'idle', text: string, busy = false) =>
  `<tr class="dv__verdict is-${level}${busy ? ' is-busy' : ''}"><td><span class="dot" aria-hidden="true"></span>${esc(text)}</td></tr>`
const row = (cls: string, html: string) => `<tr class="${cls}"><td>${html}</td></tr>`
const noteRow = (note?: string) => (note ? row('dv__note', esc(note)) : '')
const LOG_NAME: Record<CheckName, string> = {
  decode: 'what it does',
  simulate: 'simulation',
  poisoning: 'lookalikes',
  labels: 'scam reports',
  token: 'token',
}
const LOG_WORD: Record<RowState, string> = {
  ok: 'ok',
  warn: 'check',
  danger: 'flag',
  failed: 'couldn’t check',
  skipped: 'not needed',
  waiting: 'running',
}
/** The 5 checks as console lines. All of them run at once, so while reading every line says "running". */
function logRow(v: WireVerdict | null, live: boolean): string {
  const lines = CHECKS.map((c) => {
    const { state } = checkRow(v, c)
    return `<li class="is-${state}"><b>${LOG_NAME[c]}</b><i aria-hidden="true"></i><span>${LOG_WORD[state]}</span></li>`
  }).join('')
  return `<tr class="dv__log${live ? ' is-live' : ''}"><td><ol aria-label="Checks">${lines}</ol></td></tr>`
}

const SIGN_IN =
  '<button type="button" class="dv__chip" data-action="signin">Sign in with Ethereum</button> <span class="dv__hint">It signs a message, never a transaction.</span>'

const ERROR_COPY: Record<ErrorKind, readonly [string, string, string]> = {
  bad_input: ['Can’t read that', 'That doesn’t look like a transaction, signature, address or token.', 'Paste a transaction, signature, address or token.'],
  network: ['No connection', 'Couldn’t reach the checker. Try again in a minute.', 'Nothing was checked. Try again.'],
  server: ['Engine error', 'Something went wrong on our side. Try again.', 'Nothing was checked. Try again in a minute.'],
}

export const EXPLAIN_FAILED = 'The written explanation failed, but the verdict above is still valid.'

/** The model closes its explanation with its own "Couldn't check: …" line (straight or curly apostrophe). */
const MODEL_COULDNT_LINE = /^[ \t]*Couldn['’]t check:.*$/gim

export function explainText(s: ChatState): string {
  if (s.kind !== 'verdict') return ''
  if (s.llmFailed) return EXPLAIN_FAILED
  // The engine row (dv__couldnt) is the only "Couldn't check" line on screen, so the model's own is dropped (also while it streams).
  const text = s.explanation.replace(MODEL_COULDNT_LINE, '').trimEnd()
  if (s.streaming && !text) return '…'
  return text
}

export function renderScreen(s: ChatState, opts: ScreenOpts): string {
  switch (s.kind) {
    case 'idle':
      return head('Nothing checked yet') + '<tbody>' + verdictRow('idle', 'Ready.') + row('dv__explain', 'Paste something below, or try one of these real cases.') + '</tbody>'
    case 'checking':
      return (
        head('Reading') +
        '<tbody>' +
        noteRow(opts.note) +
        (opts.log ? logRow(null, true) : '') +
        verdictRow('idle', 'Reading…', true) +
        row('dv__explain', `<code class="dv__paste">${esc(preview(s.input))}</code>`) +
        '</tbody>'
      )
    case 'verdict': {
      const v = s.verdict
      const nonOk = v.reasons.filter((r) => r.severity !== 'ok')
      const shown = (nonOk.length > 0 ? nonOk : v.reasons).slice(0, 3)
      const items = shown
        .map((r) => {
          const url = safeUrl(r.evidenceUrl)
          const link = url ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">source →</a>` : ''
          return `<li class="sev-${r.severity}">${esc(r.text)}${link}</li>`
        })
        .join('')
      return (
        head(titleFor(v.input)) +
        '<tbody>' +
        noteRow(opts.note) +
        (opts.log ? logRow(v, s.streaming) : '') +
        verdictRow(v.level, typo(v.headline)) +
        (items ? row('dv__why', `<ul>${items}</ul>`) : '') +
        `<tr class="dv__explain"><td data-explain aria-busy="${s.streaming}">${esc(explainText(s))}</td></tr>` +
        row('dv__couldnt', esc(couldntCheck(v))) +
        '</tbody>'
      )
    }
    case 'error': {
      const [title, line, hint] = ERROR_COPY[s.error]
      return head(title) + '<tbody>' + verdictRow('idle', line) + row('dv__explain', esc(hint)) + '</tbody>'
    }
    case 'quota': {
      const back = resetClock(s.resetAt)
      const [title, line, hint]: [string, string, string] =
        s.reason === 'paused'
          ? ['Paused', 'Free checks are paused for today.', `Today’s budget for free checks is used up. Back at ${back}.`]
          : [
              'Daily limit',
              'You’ve used today’s free checks.',
              s.limit === null ? `You’ve used your checks for today. More at ${back}.` : `You’ve used your ${s.limit} checks for today. More at ${back}.`,
            ]
      const signIn = opts.canSignIn ? row('dv__signin', `Holders of 100k $EMERALD get 100 a day. ${SIGN_IN}`) : ''
      return head(title) + '<tbody>' + verdictRow('idle', line) + row('dv__explain', esc(hint)) + signIn + '</tbody>'
    }
  }
}

/** What the bracelet screen repeats in small ("second read"). Plain text. */
export function renderMini(s: ChatState): { level: Level | 'idle'; text: string } {
  switch (s.kind) {
    case 'idle':
      return { level: 'idle', text: 'Ready.' }
    case 'checking':
      return { level: 'idle', text: 'Reading…' }
    case 'verdict':
      return { level: s.verdict.level, text: typo(s.verdict.headline) }
    case 'error':
      return { level: 'idle', text: 'Try again.' }
    case 'quota':
      return { level: 'idle', text: s.reason === 'paused' ? 'Paused.' : `Back at ${resetClock(s.resetAt)}` }
  }
}

/** S3 table "How a check works": the 5 checks of the last verdict, row by row. */
export function renderChecks(s: ChatState): string {
  const v = s.kind === 'verdict' ? s.verdict : null
  const title = v ? titleFor(v.input) : s.kind === 'checking' ? 'Reading' : 'Waiting for a paste'
  const rows = CHECKS.map((c) => {
    const r = checkRow(v, c)
    return `<tr class="dv__check is-${r.state}"><td><b>${c}</b><span>${esc(compactHex(r.text))}</span></td></tr>`
  }).join('')
  const last = v
    ? verdictRow(v.level, typo(v.headline))
    : verdictRow('idle', s.kind === 'checking' ? 'Reading…' : 'Ready.', s.kind === 'checking')
  return head(title) + '<tbody>' + rows + last + '</tbody>'
}
