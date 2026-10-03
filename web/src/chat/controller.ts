// Wires the hero device-view: form, "Try a real case" chips, SSE and state machine.
import { streamChat, type ClientEvent } from './client.js'
import { typo } from './format.js'
import { IDLE, isBusy, lightLevel, reduce, type ChatAction, type ChatState } from './machine.js'
import { explainText, renderScreen } from './render.js'
import { CHIPS, SAMPLES, type Sample } from './samples.js'

/**
 * A connection that goes silent this long (no event at all) is dead for the user: the server bounds the model at 30 s
 * and the whole request at 55 s, so 45 s of silence cannot be a slow answer.
 */
export const STALL_MS = 45_000

export interface ChatView {
  panel: HTMLElement
  screen: HTMLTableElement
  form: HTMLFormElement
  input: HTMLTextAreaElement
  submit: HTMLButtonElement
  chips: HTMLElement
  announce: HTMLElement
}

export interface ChatHooks {
  canSignIn: boolean
  /** Show the checks log above the verdict (Emerald.exe). */
  log?: boolean
  /** SIWE session address, if any. The chips use their case's victim. */
  userAddress: () => string | undefined
  onChange: (s: ChatState, prev: ChatState) => void
  onSettled: () => void
  onSignIn: () => void
  fetchImpl?: typeof fetch
}

function autoGrow(t: HTMLTextAreaElement): void {
  t.style.height = 'auto'
  t.style.height = `${Math.min(t.scrollHeight, 180)}px`
}

export function mountChat(v: ChatView, hooks: ChatHooks) {
  let state: ChatState = IDLE
  let note: string | undefined

  function paint(prev: ChatState, s: ChatState): void {
    // During the stream only the explanation cell changes: the table is not re-rendered.
    if (prev.kind === 'verdict' && s.kind === 'verdict' && prev.verdict === s.verdict && prev.llmFailed === s.llmFailed && prev.streaming === s.streaming) {
      const cell = v.screen.querySelector<HTMLElement>('[data-explain]')
      if (cell) {
        cell.textContent = explainText(s)
        return
      }
    }
    v.screen.innerHTML = renderScreen(s, { canSignIn: hooks.canSignIn, note, log: hooks.log })
    v.panel.dataset.verdict = lightLevel(s)
    v.submit.disabled = isBusy(s)
    if (s.kind === 'verdict' && prev.kind === 'checking') v.announce.textContent = typo(s.verdict.headline)
    else if (s.kind === 'verdict' && !s.streaming && prev.kind === 'verdict' && prev.streaming) v.announce.textContent = `${typo(s.verdict.headline)} ${explainText(s)}`
    else if (s.kind === 'error' || s.kind === 'quota') v.announce.textContent = v.screen.querySelector('.dv__verdict')?.textContent ?? ''
  }

  function dispatch(a: ChatAction): void {
    const prev = state
    state = reduce(state, a)
    if (state === prev) return
    paint(prev, state)
    hooks.onChange(state, prev)
    if (isBusy(prev) && !isBusy(state)) hooks.onSettled()
  }

  async function ask(input: string, sample?: Sample): Promise<void> {
    if (isBusy(state)) return
    note = sample?.note
    dispatch({ type: 'submit', input })
    if (state.kind !== 'checking') return
    // Like a chat: what was sent leaves the input and shows in the "Reading" row (escaped preview).
    v.input.value = ''
    autoGrow(v.input)
    const userAddress = sample?.userAddress ?? hooks.userAddress()
    // Stall guard: every event re-arms the timer; if it fires, the request is aborted and the panel leaves its busy
    // state as a network failure (streamChat is silent on abort), so the input never stays locked until a reload.
    const ctrl = new AbortController()
    let stall: ReturnType<typeof setTimeout> | undefined
    const disarm = (): void => clearTimeout(stall)
    const arm = (): void => {
      disarm()
      stall = setTimeout(() => {
        ctrl.abort()
        dispatch({ type: 'network', message: 'timeout' })
      }, STALL_MS)
    }
    const emit = (e: ClientEvent): void => {
      if (ctrl.signal.aborted) return // a late event of a request that was already given up must not touch the panel
      dispatch(e)
      if (isBusy(state)) arm()
      else disarm()
    }
    arm()
    try {
      await streamChat({ input: state.input, ...(userAddress ? { userAddress } : {}) }, emit, { fetchImpl: hooks.fetchImpl, signal: ctrl.signal })
    } finally {
      disarm()
    }
  }

  v.form.addEventListener('submit', (e) => {
    e.preventDefault()
    void ask(v.input.value)
  })
  v.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      v.form.requestSubmit()
    }
  })
  v.input.addEventListener('input', () => autoGrow(v.input))
  for (const id of CHIPS) {
    const sample = SAMPLES[id]
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'dv__chip'
    b.dataset.sample = id
    b.dataset.level = sample.level
    b.textContent = sample.label
    b.addEventListener('click', () => void ask(sample.input, sample))
    v.chips.append(b)
  }
  v.screen.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest('[data-action="signin"]')) hooks.onSignIn()
  })

  return {
    get state() {
      return state
    },
    dispatch,
    ask,
  }
}
