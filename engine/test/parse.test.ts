import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseInput } from '../parse.js'

const CASES = fileURLToPath(new URL('./fixtures/cases/', import.meta.url))
const caseInput = (name: string) => (JSON.parse(readFileSync(CASES + name + '.json', 'utf8')) as { input: string }).input

describe('parseInput', () => {
  it('address (any casing) -> checksummed', () => {
    expect(parseInput('0x4680bdc9af57523f85d75499133f4e6633ac0ead')).toEqual({
      kind: 'address',
      address: '0x4680BDC9aF57523f85d75499133f4e6633ac0Ead',
    })
  })

  it('address inside free text', () => {
    expect(parseInput('is 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 safe?')).toMatchObject({ kind: 'address' })
  })

  it('tx hash wins over an address and is lowercased', () => {
    const r = parseInput('check 0x020419AFcdb33f575ba84361e3125b832c11a2d22fc187132a87a4b4baa02f8e please')
    expect(r).toEqual({ kind: 'txHash', hash: '0x020419afcdb33f575ba84361e3125b832c11a2d22fc187132a87a4b4baa02f8e' })
  })

  it('raw calldata alone is not an address nor a hash', () => {
    expect(parseInput('0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffff').kind).toBe('unknown')
  })

  it('unsigned tx JSON (real case) with hex value', () => {
    const r = parseInput(caseInput('poisoning-wbtc-68m-legit-counterparty'))
    expect(r).toEqual({
      kind: 'tx',
      tx: {
        from: '0x1E227979f0b5BC691a70DEAed2e0F39a6F538FD5',
        to: '0xd9A1b0B1e1aE382DbDc898Ea68012FfcB2853a91',
        data: '0x',
        value: 50000000000000000n,
      },
    })
  })

  it('tx JSON accepts "input" instead of "data" and a decimal value', () => {
    const r = parseInput('{"to":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","input":"0xA9059CBB","value":"12"}')
    expect(r).toEqual({ kind: 'tx', tx: { to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', data: '0xa9059cbb', value: 12n } })
  })

  it('typed data: Permit2 PermitBatch (real case)', () => {
    const r = parseInput(caseInput('permit2-batch-inferno-drainer'))
    expect(r.kind).toBe('typedData')
    if (r.kind !== 'typedData') return
    expect(r.typedData.primaryType).toBe('PermitBatch')
    expect(r.typedData.domain.name).toBe('Permit2')
    expect(r.typedData.message.spender).toBe('0x00001f78189bE22C3498cFF1B8e02272C3220000')
  })

  it('typed data wrapped as eth_signTypedData_v4 params [signer, "json"]', () => {
    const td = caseInput('permit2-single-uniswap-universal-router')
    const r = parseInput(JSON.stringify(['0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f', td]))
    expect(r.kind).toBe('typedData')
  })

  // A JSON payload we cannot read must fail safe (unknown -> bad_input), never become a verdict on the
  // first address inside it (usually the user's own signer).
  describe('unreadable JSON fails safe', () => {
    const FROM = '0x1E227979f0b5BC691a70DEAed2e0F39a6F538FD5'
    const TO = '0xd9A1b0B1e1aE382DbDc898Ea68012FfcB2853a91'
    const tx = { from: FROM, to: TO, data: '0x', value: '0x0' }

    it('eth_sendTransaction RPC wrapper is unwrapped to the tx', () => {
      expect(parseInput(JSON.stringify({ method: 'eth_sendTransaction', params: [tx] }))).toEqual({
        kind: 'tx',
        tx: { from: FROM, to: TO, data: '0x', value: 0n },
      })
    })

    it('a single-element [tx] array is unwrapped to the tx', () => {
      expect(parseInput(JSON.stringify([tx]))).toMatchObject({ kind: 'tx', tx: { from: FROM, to: TO } })
    })

    it('eth_signTypedData_v4 RPC wrapper is unwrapped to the typed data (object or string)', () => {
      const td = JSON.parse(caseInput('permit2-single-uniswap-universal-router'))
      const signer = '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f'
      for (const payload of [td, JSON.stringify(td)]) {
        const r = parseInput(JSON.stringify({ method: 'eth_signTypedData_v4', params: [signer, payload] }))
        expect(r.kind).toBe('typedData')
      }
    })

    it('tx without a recipient (to: null / missing) is unknown, not an address verdict', () => {
      expect(parseInput(JSON.stringify({ ...tx, to: null })).kind).toBe('unknown')
      expect(parseInput(JSON.stringify({ from: FROM, data: '0x6080', value: '0x0' })).kind).toBe('unknown')
    })

    it('tx with an invalid value ("0x", unsafe integer) is unknown, not an address verdict', () => {
      expect(parseInput(JSON.stringify({ ...tx, value: '0x' })).kind).toBe('unknown')
      expect(parseInput(JSON.stringify(tx).replace('"value":"0x0"', '"value":1e21')).kind).toBe('unknown')
    })

    it('an unknown RPC method carrying addresses or hashes is unknown', () => {
      const hash = '0x020419afcdb33f575ba84361e3125b832c11a2d22fc187132a87a4b4baa02f8e'
      expect(parseInput(JSON.stringify({ method: 'eth_sign', params: [FROM, '0xdeadbeef'] })).kind).toBe('unknown')
      expect(parseInput(JSON.stringify({ hash })).kind).toBe('unknown')
    })

    it('stray brackets and trailing text do not hide a payload', () => {
      expect(parseInput('hey [note] ' + JSON.stringify(tx)).kind).toBe('tx')
      expect(parseInput(JSON.stringify(tx) + ' thanks [1]').kind).toBe('tx')
      const td = caseInput('permit2-batch-inferno-drainer')
      expect(parseInput('see {this} ' + td).kind).toBe('typedData')
    })

    it('a truncated payload is unknown', () => {
      expect(parseInput(JSON.stringify(tx).slice(0, 70)).kind).toBe('unknown')
      expect(parseInput(caseInput('permit2-batch-inferno-drainer').slice(0, 400)).kind).toBe('unknown')
    })

    it('harmless brackets around a pasted address still give the address', () => {
      const a = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
      for (const text of [`is ${a} safe? [1]`, `is ${a} safe? {}`, `is ${a} safe? [thanks]`]) {
        expect(parseInput(text)).toEqual({ kind: 'address', address: a })
      }
    })
  })

  it('garbage -> unknown (truncated to 200 chars)', () => {
    const r = parseInput('hello '.repeat(100))
    expect(r.kind).toBe('unknown')
    if (r.kind === 'unknown') expect(r.raw.length).toBe(200)
  })
})
