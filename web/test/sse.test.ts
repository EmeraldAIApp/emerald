import { describe, expect, it } from 'vitest'
import { SseParser } from '../src/chat/sse.js'

describe('SseParser', () => {
  it('parses complete frames', () => {
    const p = new SseParser()
    expect(p.push('event: delta\ndata: {"text":"hi"}\n\nevent: done\ndata: {}\n\n')).toEqual([
      { event: 'delta', data: '{"text":"hi"}' },
      { event: 'done', data: '{}' },
    ])
  })

  it('reassembles a frame cut at any byte', () => {
    const whole = 'event: verdict\ndata: {"a":1}\n\n'
    for (let cut = 1; cut < whole.length; cut++) {
      const p = new SseParser()
      const got = [...p.push(whole.slice(0, cut)), ...p.push(whole.slice(cut))]
      expect(got).toEqual([{ event: 'verdict', data: '{"a":1}' }])
    }
  })

  it('handles CRLF split between chunks, comments and multi-line data', () => {
    const p = new SseParser()
    const got = [...p.push(': keepalive\r\nevent: delta\r\ndata: a\r'), ...p.push('\ndata: b\r\n\r\n')]
    expect(got).toEqual([{ event: 'delta', data: 'a\nb' }])
  })

  it('defaults the event name to message and flushes a trailing frame without blank line', () => {
    const p = new SseParser()
    expect(p.push('data: x')).toEqual([])
    expect(p.flush()).toEqual([{ event: 'message', data: 'x' }])
    expect(p.flush()).toEqual([])
  })
})
