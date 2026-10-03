import { describe, expect, it } from 'vitest'
import { concatList, parseSse, verdictFromSse } from '../demo.js'

const STREAM = [
  'event: verdict',
  'data: {"level":"red","headline":"Don\'t sign.","reasons":[],"checksOk":["decode"],"checksFailed":[],"input":{"kind":"typedData"},"chainId":1,"engineVersion":"0.1.0"}',
  '',
  'event: delta',
  'data: {"text":"This asks for "}',
  '',
  'event: delta',
  'data: {"text":"all your USDC."}',
  '',
  'event: done',
  'data: {"usage":{"inputTokens":1300,"outputTokens":350,"costUsd":0.0112}}',
  '',
  '',
].join('\n')

describe('parseSse', () => {
  it('reads the four /api/chat events in order', () => {
    expect(parseSse(STREAM).map((e) => e.event)).toEqual(['verdict', 'delta', 'delta', 'done'])
  })
  it('accepts CRLF line endings', () => {
    expect(parseSse(STREAM.replace(/\n/g, '\r\n'))).toHaveLength(4)
  })
})

describe('verdictFromSse', () => {
  it('returns the engine verdict', () => {
    expect(verdictFromSse(STREAM)).toMatchObject({ level: 'red', headline: "Don't sign.", input: { kind: 'typedData' } })
  })
  it('fails loudly when the stream has no verdict (quota, paused or error)', () => {
    expect(() => verdictFromSse('event: error\ndata: {"code":"quota","message":"x"}\n\n')).toThrow('no verdict event')
  })
})

describe('concatList', () => {
  it('gives each frame the time until the next one and repeats the last file', () => {
    const list = concatList(
      [
        { file: 'C:/x/frames/f00000.jpg', t: 100 },
        { file: 'C:/x/frames/f00001.jpg', t: 100.04 },
        { file: 'C:/x/frames/f00002.jpg', t: 101.5 },
      ],
      103.5,
    )
    expect(list).toBe(
      [
        'ffconcat version 1.0',
        "file 'f00000.jpg'",
        'duration 0.040',
        "file 'f00001.jpg'",
        'duration 1.460',
        "file 'f00002.jpg'",
        'duration 2.000',
        "file 'f00002.jpg'",
        '',
      ].join('\n'),
    )
  })
  it('refuses an empty recording', () => {
    expect(() => concatList([], 1)).toThrow('no frames captured')
  })
})
