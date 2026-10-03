import { describe, expect, it } from 'vitest'
import type { AccountFacts } from '../accounts.js'
import { NATIVE_ETH, TOPIC, WETH } from '../known.js'
import { extractMovements, gatherSimulation, netDeltas, simulateCheck, type SimulationOutcome } from '../simulate.js'
import type { JsonRpcResponse, RpcLog, SimBlockResult } from '../sources/raw-types.js'
import type { Action, Hex, Subject } from '../types.js'
import { raw } from './helpers/fixtures.js'
import { stubSources } from './helpers/stub-sources.js'

const NOW = new Date('2026-09-30T20:00:00Z')
const BINANCE14 = '0x28c6c06298d514db089934071355e5743bf21d60' as Hex
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Hex
const POISONER = '0xd9a1c3788d81257612e2581a6ea0ada244853a91' as Hex
const simCall = (name: string) => raw<JsonRpcResponse<SimBlockResult[]>>(name).result![0]!.calls[0]!

const verifiedOld: AccountFacts = {
  address: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af', kind: 'contract', delegate: null,
  blockscout: { isScam: false, reputation: 'ok', isContract: true, isVerified: true, proxyType: null, name: null, ens: null, isToken: false, tokenType: null, creationTxHash: null, delegateName: null },
  createdAt: new Date('2024-01-01T00:00:00Z'), goplus: null, tags: [], failed: [],
}
const sim = (name: string): SimulationOutcome => {
  const c = simCall(name)
  return { applicable: true, error: null, facts: { source: 'simulated', status: c.status === '0x1' ? 'success' : 'reverted', revertReason: c.error?.message ?? null, sender: BINANCE14, movements: extractMovements(c.logs) } }
}
const codes = (r: { reasons: { code: string; severity: string }[] }) => r.reasons.map((x) => `${x.code}:${x.severity}`)
const call: Action = { type: 'call', to: USDC, functionName: 'execute', decodedWith: 'sourcify' }

describe('extractMovements / netDeltas (real eth_simulateV1 fixtures)', () => {
  it('approve max: one Approval, no transfers', () => {
    const m = extractMovements(simCall('rpc-simulateV1-usdc-approve-permit2-max').logs)
    expect(m).toEqual([{ kind: 'approval', asset: USDC, standard: 'erc20', owner: BINANCE14, spender: '0x000000000022d473030f116ddee9f6b43ac78ba3', amount: 2n ** 256n - 1n }])
  })
  it('Universal Router swap: -0.1 ETH, +266.996954 USDC', () => {
    const d = netDeltas(extractMovements(simCall('rpc-simulateV1-universal-router-swap-0.1eth-to-usdc').logs), BINANCE14)
    expect(d).toEqual([
      { asset: NATIVE_ETH, standard: 'native', amount: -(10n ** 17n) },
      { asset: USDC, standard: 'erc20', amount: 266996954n },
    ])
  })
  it('WETH deposit is not "ETH out, nothing in"', () => {
    const d = netDeltas(extractMovements(simCall('rpc-simulateV1-weth-deposit-1eth').logs), BINANCE14)
    expect(d).toEqual([
      { asset: NATIVE_ETH, standard: 'native', amount: -(10n ** 18n) },
      { asset: WETH, standard: 'erc20', amount: 10n ** 18n },
    ])
  })
})

describe('extractMovements with malformed logs (any contract in the simulation can emit them)', () => {
  const pad = (a: Hex) => `0x${'0'.repeat(24)}${a.slice(2)}`
  const word = (n: bigint) => `0x${n.toString(16).padStart(64, '0')}`
  const mkLog = (address: Hex, topics: string[], data: string): RpcLog => ({
    address, topics, data, blockHash: '0x1', blockNumber: '0x1', transactionHash: '0x2', transactionIndex: '0x0', logIndex: '0x0', removed: false,
  })
  const goodTransfer = mkLog(USDC, [TOPIC.Transfer, pad(BINANCE14), pad(POISONER)], word(8n))
  const goodMove = { kind: 'transfer', asset: USDC, standard: 'erc20', from: BINANCE14, to: POISONER, amount: 8n }

  it('skips a Transfer / Approval / ApprovalForAll / WETH log with empty data and keeps the rest', () => {
    const logs = [
      mkLog(USDC, [TOPIC.Transfer, pad(BINANCE14), pad(POISONER)], '0x'),
      mkLog(USDC, [TOPIC.Approval, pad(BINANCE14), pad(POISONER)], '0x'),
      mkLog(USDC, [TOPIC.ApprovalForAll, pad(BINANCE14), pad(POISONER)], '0x'),
      mkLog(WETH, [TOPIC.WethDeposit, pad(BINANCE14)], '0x'),
      mkLog(WETH, [TOPIC.WethWithdrawal, pad(BINANCE14)], '0x'),
      goodTransfer,
    ]
    expect(extractMovements(logs)).toEqual([goodMove])
  })
  it('skips a log whose data is not hex at all, without dropping the movements around it', () => {
    const logs = [goodTransfer, mkLog(USDC, [TOPIC.Transfer, pad(BINANCE14), pad(POISONER)], 'not-hex'), goodTransfer]
    expect(extractMovements(logs)).toEqual([goodMove, goodMove])
  })
  it('a drainer that emits a malformed log cannot hide its outflow: still danger, not a failed simulation', async () => {
    const real = simCall('rpc-simulateV1-usdc-transfer-to-poisoner')
    const malformed = mkLog(USDC, [TOPIC.Transfer, pad(BINANCE14), pad(POISONER)], '0x')
    const s = stubSources({ rpc: { simulate: async () => ({ ...real, logs: [malformed, ...real.logs] }) } })
    const subject: Subject = { kind: 'tx', tx: { from: BINANCE14, to: USDC, data: '0xa9059cbb', value: 0n }, executed: null }
    const outcome = await gatherSimulation(subject, BINANCE14, s)
    expect(outcome.applicable && outcome.facts?.movements.length).toBe(1)
    const r = simulateCheck({ outcome, actor: BINANCE14, action: call, txTo: undefined, now: NOW })
    expect(r.status).toBe('ok')
    expect(codes(r)).toEqual(['SIM_ASSET_OUT_NO_IN:danger'])
  })
})

describe('simulateCheck', () => {
  it('swap with something back is ok', () => {
    const r = simulateCheck({ outcome: sim('rpc-simulateV1-universal-router-swap-0.1eth-to-usdc'), actor: BINANCE14, action: call, txTo: verifiedOld, now: NOW })
    expect(r.status).toBe('ok')
    expect(codes(r)).toEqual(['SIM_BALANCE_CHANGES:ok'])
  })
  it('a plain token transfer by the user is not "nothing in return"', () => {
    const action: Action = { type: 'tokenTransfer', token: USDC, standard: 'erc20', from: null, to: POISONER, amount: 10n ** 9n }
    const r = simulateCheck({ outcome: sim('rpc-simulateV1-usdc-transfer-to-poisoner'), actor: BINANCE14, action, txTo: undefined, now: NOW })
    expect(codes(r)).toEqual(['SIM_SEND:ok'])
  })
  it('the same outflow from an opaque call is danger (or warn if the called contract is verified and old)', () => {
    expect(codes(simulateCheck({ outcome: sim('rpc-simulateV1-usdc-transfer-to-poisoner'), actor: BINANCE14, action: call, txTo: undefined, now: NOW }))).toEqual(['SIM_ASSET_OUT_NO_IN:danger'])
    expect(codes(simulateCheck({ outcome: sim('rpc-simulateV1-usdc-transfer-to-poisoner'), actor: BINANCE14, action: call, txTo: verifiedOld, now: NOW }))).toEqual(['SIM_ASSET_OUT_NO_IN:warn'])
  })
  it('revert is a warning, not a source failure', () => {
    const r = simulateCheck({ outcome: sim('rpc-simulateV1-usdc-transfer-revert'), actor: BINANCE14, action: call, txTo: undefined, now: NOW })
    expect(r.status).toBe('ok')
    expect(r.reasons[0]).toMatchObject({ code: 'SIM_REVERTED', severity: 'warn' })
    expect(r.reasons[0]!.text).toContain('transfer amount exceeds balance')
  })
  it('approval only: no balance change', () => {
    expect(codes(simulateCheck({ outcome: sim('rpc-simulateV1-usdc-approve-permit2-max'), actor: BINANCE14, action: call, txTo: undefined, now: NOW }))).toEqual(['SIM_NO_BALANCE_CHANGE:ok'])
  })
  it('executed tx where a third party moved the user assets out is danger', () => {
    const outcome: SimulationOutcome = {
      applicable: true, error: null,
      facts: { source: 'executed', status: 'success', revertReason: null, sender: '0x00001f78189be22c3498cff1b8e02272c3220000', movements: [{ kind: 'transfer', asset: USDC, standard: 'erc20', from: BINANCE14, to: POISONER, amount: 8n }] },
    }
    expect(codes(simulateCheck({ outcome, actor: BINANCE14, action: call, txTo: verifiedOld, now: NOW }))).toEqual(['SIM_ASSET_OUT_NO_IN:danger'])
  })
  it('executed tx the user sent to an opaque call that kept the assets is judged like the unsigned one (not SIM_SEND)', () => {
    const executed = (sender: Hex): SimulationOutcome => ({
      applicable: true, error: null,
      facts: { source: 'executed', status: 'success', revertReason: null, sender, movements: [{ kind: 'transfer', asset: USDC, standard: 'erc20', from: BINANCE14, to: POISONER, amount: 8n }] },
    })
    expect(codes(simulateCheck({ outcome: executed(BINANCE14), actor: BINANCE14, action: call, txTo: undefined, now: NOW }))).toEqual(['SIM_ASSET_OUT_NO_IN:danger'])
    expect(codes(simulateCheck({ outcome: executed(BINANCE14), actor: BINANCE14, action: call, txTo: verifiedOld, now: NOW }))).toEqual(['SIM_ASSET_OUT_NO_IN:warn'])
    // A plain transfer the user sent stays a send.
    const send: Action = { type: 'tokenTransfer', token: USDC, standard: 'erc20', from: null, to: POISONER, amount: 8n }
    expect(codes(simulateCheck({ outcome: executed(BINANCE14), actor: BINANCE14, action: send, txTo: undefined, now: NOW }))).toEqual(['SIM_SEND:ok'])
  })
  it('no sender -> skipped with SIM_NO_SENDER warn; RPC down -> failed', () => {
    expect(codes(simulateCheck({ outcome: { applicable: false, noSender: true }, actor: null, action: call, txTo: undefined, now: NOW }))).toEqual(['SIM_NO_SENDER:warn'])
    const failed = simulateCheck({ outcome: { applicable: true, facts: null, error: 'rpc/timeout' }, actor: BINANCE14, action: call, txTo: undefined, now: NOW })
    expect(failed.status).toBe('failed')
  })
})

describe('gatherSimulation', () => {
  const subject: Subject = { kind: 'tx', tx: { from: null, to: USDC, data: '0xa9059cbb', value: 10n }, executed: null }
  it('uses the actor when the tx has no from, and overrides the balance when value > 0', async () => {
    let seen: { from: Hex; opts: unknown } | null = null
    const s = stubSources({ rpc: { simulate: async (c, opts) => { seen = { from: c.from, opts }; return simCall('rpc-simulateV1-usdc-transfer-to-poisoner') } } })
    const o = await gatherSimulation(subject, BINANCE14, s)
    expect(seen).toEqual({ from: BINANCE14, opts: { balanceOverride: 10n + 10n ** 18n } })
    expect(o.applicable && o.facts?.movements.length).toBe(1)
  })
  it('no from and no actor -> not applicable, noSender', async () => {
    expect(await gatherSimulation(subject, null, stubSources())).toEqual({ applicable: false, noSender: true })
  })
  it('RPC error -> facts null with the error message', async () => {
    const o = await gatherSimulation(subject, BINANCE14, stubSources())
    expect(o).toMatchObject({ applicable: true, facts: null })
  })
})
