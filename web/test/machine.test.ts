import { describe, expect, it } from 'vitest'
import { IDLE, isBusy, lightLevel, reduce, type ChatAction, type ChatState } from '../src/chat/machine.js'
import { RED } from './fixtures.js'

const run = (actions: ChatAction[], from: ChatState = IDLE) => actions.reduce(reduce, from)
const usage = { inputTokens: 10, outputTokens: 20, costUsd: 0.01 }

describe('chat machine', () => {
  it('idle -> checking trims input and ignores empty submits', () => {
    expect(run([{ type: 'submit', input: '   ' }])).toBe(IDLE)
    expect(run([{ type: 'submit', input: '  0xabc \n' }])).toEqual({ kind: 'checking', input: '0xabc' })
  })

  it('happy path: verdict, deltas, done', () => {
    const s = run([
      { type: 'submit', input: 'x' },
      { type: 'verdict', verdict: RED },
      { type: 'delta', text: 'Do not ' },
      { type: 'delta', text: 'sign.' },
      { type: 'done', usage },
      { type: 'end' },
    ])
    expect(s).toEqual({ kind: 'verdict', input: 'x', verdict: RED, explanation: 'Do not sign.', streaming: false, llmFailed: false, usage })
    expect(lightLevel(s)).toBe('red')
    expect(isBusy(s)).toBe(false)
  })

  it('ignores submits and resets while checking or streaming', () => {
    const checking = run([{ type: 'submit', input: 'a' }])
    expect(reduce(checking, { type: 'submit', input: 'b' })).toBe(checking)
    const streaming = reduce(checking, { type: 'verdict', verdict: RED })
    expect(isBusy(streaming)).toBe(true)
    expect(reduce(streaming, { type: 'submit', input: 'b' })).toBe(streaming)
    expect(reduce(streaming, { type: 'reset' })).toBe(streaming)
  })

  it('an llm error after the verdict keeps the color and drops the partial text', () => {
    const s = run([
      { type: 'submit', input: 'x' },
      { type: 'verdict', verdict: RED },
      { type: 'delta', text: 'partial' },
      { type: 'error', code: 'llm', message: 'refusal' },
      { type: 'delta', text: 'late' },
      { type: 'done', usage: null },
    ])
    expect(s).toMatchObject({ kind: 'verdict', explanation: '', llmFailed: true, streaming: false })
    expect(lightLevel(s)).toBe('red')
  })

  it('429 with body -> quota state with tier, limit and reset', () => {
    const body = { error: 'paused', tier: 'anon', limit: 5, resetAt: '2026-10-01T00:00:00.000Z' }
    expect(run([{ type: 'submit', input: 'x' }, { type: 'http', status: 429, body }])).toEqual({
      kind: 'quota', input: 'x', reason: 'paused', tier: 'anon', limit: 5, resetAt: '2026-10-01T00:00:00.000Z',
    })
  })

  it('429 without a readable body and the SSE quota error still reach quota', () => {
    expect(run([{ type: 'submit', input: 'x' }, { type: 'http', status: 429, body: null }])).toMatchObject({ kind: 'quota', reason: 'quota', limit: null })
    expect(run([{ type: 'submit', input: 'x' }, { type: 'error', code: 'quota', message: '' }])).toMatchObject({ kind: 'quota', reason: 'quota' })
  })

  it('400 and the SSE bad_input error -> bad_input; 500 and an llm error before the verdict -> server', () => {
    expect(run([{ type: 'submit', input: 'x' }, { type: 'http', status: 400, body: { error: 'bad_input' } }])).toEqual({ kind: 'error', input: 'x', error: 'bad_input' })
    expect(run([{ type: 'submit', input: 'x' }, { type: 'error', code: 'bad_input', message: '' }])).toEqual({ kind: 'error', input: 'x', error: 'bad_input' })
    expect(run([{ type: 'submit', input: 'x' }, { type: 'http', status: 500, body: null }])).toEqual({ kind: 'error', input: 'x', error: 'server' })
    // The API can fail the quota store or the engine before any verdict: llm error with no done, shown as an engine error.
    expect(run([{ type: 'submit', input: 'x' }, { type: 'error', code: 'llm', message: 'The checks could not run.' }])).toEqual({ kind: 'error', input: 'x', error: 'server' })
  })

  it('network failures and a stream that ends before the verdict -> network error', () => {
    expect(run([{ type: 'submit', input: 'x' }, { type: 'network', message: 'offline' }])).toEqual({ kind: 'error', input: 'x', error: 'network' })
    expect(run([{ type: 'submit', input: 'x' }, { type: 'end' }])).toEqual({ kind: 'error', input: 'x', error: 'network' })
  })

  it('a stream cut mid-explanation keeps the verdict and marks the explanation failed', () => {
    const s = run([{ type: 'submit', input: 'x' }, { type: 'verdict', verdict: RED }, { type: 'delta', text: 'half' }, { type: 'network', message: 'reset' }])
    expect(s).toMatchObject({ kind: 'verdict', streaming: false, llmFailed: true, explanation: '' })
  })

  it('an end without done closes the stream and keeps the text', () => {
    const s = run([{ type: 'submit', input: 'x' }, { type: 'verdict', verdict: RED }, { type: 'delta', text: 'ok' }, { type: 'end' }])
    expect(s).toMatchObject({ streaming: false, explanation: 'ok', llmFailed: false })
  })

  it('reset returns to idle from a finished state; a new submit starts over', () => {
    const done = run([{ type: 'submit', input: 'x' }, { type: 'http', status: 500, body: null }])
    expect(reduce(done, { type: 'reset' })).toBe(IDLE)
    expect(reduce(done, { type: 'submit', input: 'y' })).toEqual({ kind: 'checking', input: 'y' })
    expect(lightLevel(done)).toBe('idle')
  })

  it('stray events outside their state are ignored', () => {
    expect(reduce(IDLE, { type: 'verdict', verdict: RED })).toBe(IDLE)
    expect(reduce(IDLE, { type: 'delta', text: 'x' })).toBe(IDLE)
    expect(reduce(IDLE, { type: 'http', status: 429, body: null })).toBe(IDLE)
  })
})
