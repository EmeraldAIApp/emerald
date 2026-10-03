// Chat state machine: idle / checking / verdict / error / quota. Pure: (state, action) -> state.
// The color comes from the engine verdict; no LLM event (delta/error) changes it.
import type { ClientEvent } from './client.js'
import { isQuota429, type Level, type Tier, type Usage, type WireVerdict } from './wire.js'

export type ErrorKind = 'bad_input' | 'network' | 'server'

export type ChatState =
  | { kind: 'idle' }
  | { kind: 'checking'; input: string }
  | {
      kind: 'verdict'
      input: string
      verdict: WireVerdict
      explanation: string
      streaming: boolean
      llmFailed: boolean
      usage: Usage | null
    }
  | { kind: 'error'; input: string; error: ErrorKind }
  | { kind: 'quota'; input: string; reason: 'quota' | 'paused'; tier: Tier | null; limit: number | null; resetAt: string | null }

export type ChatAction = { type: 'submit'; input: string } | { type: 'reset' } | ClientEvent

export const IDLE: ChatState = { kind: 'idle' }

export function isBusy(s: ChatState): boolean {
  return s.kind === 'checking' || (s.kind === 'verdict' && s.streaming)
}

export function lightLevel(s: ChatState): 'idle' | Level {
  return s.kind === 'verdict' ? s.verdict.level : 'idle'
}

export function reduce(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case 'submit': {
      const input = a.input.trim()
      if (!input || isBusy(s)) return s
      return { kind: 'checking', input }
    }
    case 'reset':
      return isBusy(s) ? s : IDLE
    case 'verdict':
      if (s.kind !== 'checking') return s
      return { kind: 'verdict', input: s.input, verdict: a.verdict, explanation: '', streaming: true, llmFailed: false, usage: null }
    case 'delta':
      if (s.kind !== 'verdict' || !s.streaming || s.llmFailed) return s
      return { ...s, explanation: s.explanation + a.text }
    case 'done':
      if (s.kind !== 'verdict') return s
      return { ...s, streaming: false, usage: a.usage }
    case 'error':
      if (s.kind === 'checking') {
        if (a.code === 'quota' || a.code === 'paused') return { kind: 'quota', input: s.input, reason: a.code, tier: null, limit: null, resetAt: null }
        return { kind: 'error', input: s.input, error: a.code === 'bad_input' ? 'bad_input' : 'server' }
      }
      // After the verdict only the explanation can fail: the partial text is dropped and the color stays.
      if (s.kind === 'verdict' && s.streaming) return { ...s, explanation: '', llmFailed: true }
      return s
    case 'http':
      if (s.kind !== 'checking') return s
      if (a.status === 429) {
        return isQuota429(a.body)
          ? { kind: 'quota', input: s.input, reason: a.body.error, tier: a.body.tier, limit: a.body.limit, resetAt: a.body.resetAt }
          : { kind: 'quota', input: s.input, reason: 'quota', tier: null, limit: null, resetAt: null }
      }
      return { kind: 'error', input: s.input, error: a.status === 400 ? 'bad_input' : 'server' }
    case 'network':
      if (s.kind === 'checking') return { kind: 'error', input: s.input, error: 'network' }
      if (s.kind === 'verdict' && s.streaming) return { ...s, explanation: '', llmFailed: true, streaming: false }
      return s
    case 'end':
      if (s.kind === 'checking') return { kind: 'error', input: s.input, error: 'network' }
      if (s.kind === 'verdict' && s.streaming) return { ...s, streaming: false }
      return s
  }
}
