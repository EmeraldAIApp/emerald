import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { encodeFunctionData, parseAbi } from 'viem'
import { describe, expect, it } from 'vitest'
import type { AccountFacts } from '../accounts.js'
import { decodeAction, decodeCheck, decodeWithCandidates } from '../decode.js'
import { parseInput } from '../parse.js'
import type { BlockscoutToken, OpenchainSig, SourcifyContract } from '../sources/raw-types.js'
import { resolveSubject } from '../subject.js'
import type { Hex, Subject } from '../types.js'
import { reason as reasonOf } from '../util.js'
import { manifest, raw } from './helpers/fixtures.js'
import { stubSources } from './helpers/stub-sources.js'

const NOW = new Date('2026-09-30T20:00:00Z')
const CASES = fileURLToPath(new URL('./fixtures/cases/', import.meta.url))
const caseInput = (name: string) => (JSON.parse(readFileSync(CASES + name + '.json', 'utf8')) as { input: string }).input

const ERC = parseAbi(['function approve(address spender, uint256 amount)', 'function setApprovalForAll(address operator, bool approved)'])
const DRAINER_EOA = '0x00001f78189bE22C3498cFF1B8e02272C3220000'
const USDC_TOKEN = raw<BlockscoutToken>('blockscout-token-usdc')
const tokenSources = (type = 'ERC-20') => stubSources({ blockscout: { getToken: async () => ({ ...USDC_TOKEN, type }) } })

function facts(address: string, kind: AccountFacts['kind'], verified = true, createdAt: Date | null = null): AccountFacts {
  return {
    address: address.toLowerCase() as Hex,
    kind,
    delegate: null,
    blockscout: {
      isScam: false, reputation: 'ok', isContract: kind === 'contract', isVerified: verified, proxyType: null, name: null,
      ens: null, isToken: false, tokenType: null, creationTxHash: null, delegateName: null,
    },
    createdAt,
    goplus: null,
    tags: [],
    failed: [],
  }
}
const accountsOf = (...fs: AccountFacts[]) => new Map(fs.map((f) => [f.address, f]))

async function subjectOf(input: string): Promise<Subject> {
  const p = parseInput(input)
  if (p.kind === 'unknown') throw new Error('unparsable')
  return resolveSubject(p, stubSources())
}
const codes = (r: { reasons: { code: string; severity: string }[] }) => r.reasons.map((x) => `${x.code}:${x.severity}`)

describe('decode: approvals', () => {
  it('unlimited ERC-20 approve to an EOA is danger (real case input)', async () => {
    const o = await decodeAction(await subjectOf(caseInput('approve-unlimited-usdc-to-eoa')), tokenSources())
    expect(o.action).toMatchObject({ type: 'approve', standard: 'erc20', spender: '0x3bfa437f9d5c0318ca78668836a15f528497d76f' })
    const r = decodeCheck(o, accountsOf(facts('0x3bfa437f9d5c0318ca78668836a15f528497d76f', 'eoa')), NOW)
    expect(r.status).toBe('ok')
    expect(codes(r)).toContain('APPROVE_UNLIMITED_EOA:danger')
  })

  it('same approve to a verified contract is only a warning; to an unverified one is danger', async () => {
    const o = await decodeAction(await subjectOf(caseInput('approve-unlimited-usdc-to-eoa')), tokenSources())
    const spender = '0x3bfa437f9d5c0318ca78668836a15f528497d76f'
    expect(codes(decodeCheck(o, accountsOf(facts(spender, 'contract', true)), NOW))).toContain('APPROVE_UNLIMITED_VERIFIED:warn')
    expect(codes(decodeCheck(o, accountsOf(facts(spender, 'contract', false)), NOW))).toContain('APPROVE_UNLIMITED_UNVERIFIED:danger')
  })

  it('exact approve to Permit2 is ok (real case input)', async () => {
    const o = await decodeAction(await subjectOf(caseInput('approve-exact-usdc-to-permit2')), tokenSources())
    const r = decodeCheck(o, accountsOf(facts('0x000000000022d473030f116ddee9f6b43ac78ba3', 'contract', true)), NOW)
    expect(codes(r)).toEqual(['APPROVE_LIMITED:ok'])
  })

  it('approve on an ERC-721 collection is a single NFT, not an amount', async () => {
    const data = encodeFunctionData({ abi: ERC, functionName: 'approve', args: [DRAINER_EOA, 5965n] })
    const o = await decodeAction(await subjectOf(JSON.stringify({ to: '0x138A5C693279b6Cd82F48d4bEf563251Bc15ADcE', data })), tokenSources('ERC-721'))
    expect(o.action).toMatchObject({ type: 'approve', standard: 'erc721', amount: 5965n })
    const r = decodeCheck(o, accountsOf(facts('0x00001f78189be22c3498cff1b8e02272c3220000', 'eoa')), NOW)
    expect(codes(r)).toEqual(['APPROVE_EOA:warn'])
  })

  it('ERC-721 approve of tokenId 0 is a real approval, not a revoke', async () => {
    // BAYC, Doodles and others start at token #0: the tokenId travels in `amount`, so amount 0 must not mean "revoke".
    const data = encodeFunctionData({ abi: ERC, functionName: 'approve', args: [DRAINER_EOA, 0n] })
    const o = await decodeAction(await subjectOf(JSON.stringify({ to: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', data })), tokenSources('ERC-721'))
    expect(o.action).toMatchObject({ type: 'approve', standard: 'erc721', amount: 0n })
    const r = decodeCheck(o, accountsOf(facts('0x00001f78189be22c3498cff1b8e02272c3220000', 'eoa')), NOW)
    expect(r.status).toBe('ok')
    expect(codes(r)).toEqual(['APPROVE_EOA:warn'])
    // Without spender facts it must fail, never turn green.
    const blind = decodeCheck(o, new Map(), NOW)
    expect(blind.status).toBe('failed')
    expect(codes(blind)).not.toContain('APPROVE_REVOKE:ok')
  })

  it('ERC-721 approve to the zero address is a revoke, even without spender facts', async () => {
    const data = encodeFunctionData({ abi: ERC, functionName: 'approve', args: ['0x0000000000000000000000000000000000000000', 5965n] })
    const o = await decodeAction(await subjectOf(JSON.stringify({ to: '0x138A5C693279b6Cd82F48d4bEf563251Bc15ADcE', data })), tokenSources('ERC-721'))
    expect(o.action).toMatchObject({ type: 'approve', standard: 'erc721', spender: '0x0000000000000000000000000000000000000000', amount: 5965n })
    const r = decodeCheck(o, new Map(), NOW)
    expect(r.status).toBe('ok')
    expect(codes(r)).toEqual(['APPROVE_REVOKE:ok'])
  })

  it('ERC-20 approve of amount 0 is a revoke, even without spender facts', async () => {
    const data = encodeFunctionData({ abi: ERC, functionName: 'approve', args: [DRAINER_EOA, 0n] })
    const o = await decodeAction(await subjectOf(JSON.stringify({ to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', data })), tokenSources('ERC-20'))
    expect(o.action).toMatchObject({ type: 'approve', standard: 'erc20', amount: 0n })
    const r = decodeCheck(o, new Map(), NOW)
    expect(r.status).toBe('ok')
    expect(codes(r)).toEqual(['APPROVE_REVOKE:ok'])
  })

  it('setApprovalForAll to an EOA is danger', async () => {
    const data = encodeFunctionData({ abi: ERC, functionName: 'setApprovalForAll', args: [DRAINER_EOA, true] })
    const o = await decodeAction(await subjectOf(JSON.stringify({ to: '0xA3F7250306Dbb856D8d312f93029be73343939aF', data })), stubSources())
    const r = decodeCheck(o, accountsOf(facts('0x00001f78189be22c3498cff1b8e02272c3220000', 'eoa')), NOW)
    expect(codes(r)).toEqual(['APPROVAL_FOR_ALL_EOA:danger'])
  })

  it('spender facts missing -> failed + SOURCE_FAILED', async () => {
    const o = await decodeAction(await subjectOf(caseInput('approve-unlimited-usdc-to-eoa')), tokenSources())
    const r = decodeCheck(o, new Map(), NOW)
    expect(r.status).toBe('failed')
    expect(codes(r)).toContain('SOURCE_FAILED:warn')
  })
})

describe('decode: unresolvable hash', () => {
  it('a hash the sources could not look up yields a single SOURCE_FAILED, not two', async () => {
    const failed = reasonOf('decode', 'SOURCE_FAILED', 'warn', 'I could not look up this transaction hash: Blockscout did not answer.')
    const r = decodeCheck(await decodeAction({ kind: 'unsupported', failed: true, reason: failed }, stubSources()), new Map(), NOW)
    expect(r.status).toBe('failed')
    expect(codes(r)).toEqual(['SOURCE_FAILED:warn'])
  })
})

describe('decode: typed data', () => {
  it('Permit2 PermitBatch to an EOA drainer is PERMIT2_UNKNOWN_SPENDER (real case)', async () => {
    const o = await decodeAction(await subjectOf(caseInput('permit2-batch-inferno-drainer')), stubSources())
    expect(o.action).toMatchObject({ type: 'permit', via: 'permit2', spender: '0x00001f78189be22c3498cff1b8e02272c3220000', unlimited: true })
    const r = decodeCheck(o, accountsOf(facts('0x00001f78189be22c3498cff1b8e02272c3220000', 'eoa')), NOW)
    expect(codes(r)).toContain('PERMIT2_UNKNOWN_SPENDER:danger')
  })

  it('Permit2 PermitSingle to Universal Router 2.1.2 (known) is an unlimited-approval warning (real case)', async () => {
    const o = await decodeAction(await subjectOf(caseInput('permit2-single-uniswap-universal-router')), stubSources())
    const r = decodeCheck(o, new Map(), NOW) // listing: does not depend on the account facts
    expect(r.status).toBe('ok')
    expect(codes(r)).toContain('APPROVE_UNLIMITED_VERIFIED:warn')
  })

  it('EIP-2612 Permit to a verified contract younger than 7 days is danger', async () => {
    const td = {
      types: { EIP712Domain: [{ name: 'name', type: 'string' }], Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
      primaryType: 'Permit',
      domain: { name: 'USD Coin', chainId: 1, verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      message: { owner: '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f', spender: '0x1111111111111111111111111111111111111111', value: '1000', nonce: '0', deadline: '9999999999' },
    }
    const o = await decodeAction(await subjectOf(JSON.stringify(td)), stubSources())
    const young = facts('0x1111111111111111111111111111111111111111', 'contract', true, new Date('2026-09-29T00:00:00Z'))
    expect(codes(decodeCheck(o, accountsOf(young), NOW))).toContain('PERMIT_UNKNOWN_SPENDER:danger')
  })

  it('Seaport order that pays the offerer nothing is danger; other chain ids warn', async () => {
    const td = {
      types: { EIP712Domain: [{ name: 'name', type: 'string' }], OrderComponents: [{ name: 'offerer', type: 'address' }] },
      primaryType: 'OrderComponents',
      domain: { name: 'Seaport', version: '1.6', chainId: 8453 },
      message: {
        offerer: '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f',
        offer: [{ itemType: 2, token: '0xA3F7250306Dbb856D8d312f93029be73343939aF', identifierOrCriteria: '1', startAmount: '1', endAmount: '1' }],
        consideration: [{ itemType: 0, token: '0x0000000000000000000000000000000000000000', identifierOrCriteria: '0', startAmount: '1', endAmount: '1', recipient: '0x2222222222222222222222222222222222222222' }],
      },
    }
    const r = decodeCheck(await decodeAction(await subjectOf(JSON.stringify(td)), stubSources()), new Map(), NOW)
    expect(codes(r)).toEqual(['TYPED_DATA_OTHER_CHAIN:warn', 'SEAPORT_NOTHING_BACK:danger'])
  })

  it('a Seaport order that pays the offerer something (even 1 wei) is never ok: Emerald cannot price it', async () => {
    const offerer = '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f'
    const td = {
      types: { EIP712Domain: [{ name: 'name', type: 'string' }], OrderComponents: [{ name: 'offerer', type: 'address' }] },
      primaryType: 'OrderComponents',
      domain: { name: 'Seaport', version: '1.6', chainId: 1, verifyingContract: '0x0000000000000068F116a894984e2DB1123eB395' },
      message: {
        offerer,
        offer: [{ itemType: 2, token: '0xA3F7250306Dbb856D8d312f93029be73343939aF', identifierOrCriteria: '1', startAmount: '1', endAmount: '1' }],
        consideration: [{ itemType: 0, token: '0x0000000000000000000000000000000000000000', identifierOrCriteria: '0', startAmount: '1', endAmount: '1', recipient: offerer }],
      },
    }
    const r = decodeCheck(await decodeAction(await subjectOf(JSON.stringify(td)), stubSources()), new Map(), NOW)
    expect(codes(r)).toEqual(['SEAPORT_LISTING:warn'])
    expect(r.reasons[0]!.text).toContain('cannot price this order')
  })

  it('unknown typed data is a warning', async () => {
    const td = { types: { Mail: [{ name: 'body', type: 'string' }] }, primaryType: 'Mail', domain: { name: 'Ether Mail', chainId: 1 }, message: { body: 'hi' } }
    const r = decodeCheck(await decodeAction(await subjectOf(JSON.stringify(td)), stubSources()), new Map(), NOW)
    expect(codes(r)).toEqual(['TYPED_DATA_UNKNOWN:warn'])
  })
})

describe('decode: generic calls', () => {
  const swapCall = (manifest['rpc-simulateV1-universal-router-swap-0.1eth-to-usdc']!.requestBody as { params: [{ blockStateCalls: [{ calls: [{ to: string; data: string }] }] }] })
    .params[0].blockStateCalls[0].calls[0]

  it('uses the Sourcify ABI when the contract is verified', async () => {
    const abi = raw<SourcifyContract>('sourcify-v2-universal-router-v4-abi').abi!
    const s = stubSources({ sourcify: { resolvedAbi: async () => ({ abi, implementation: null }) } })
    const o = await decodeAction(await subjectOf(JSON.stringify({ to: swapCall.to, data: swapCall.data })), s)
    expect(o.action).toMatchObject({ type: 'call', functionName: 'execute', decodedWith: 'sourcify' })
    expect(decodeCheck(o, new Map(), NOW).status).toBe('ok')
  })

  it('falls back to openchain (exact round-trip) when Sourcify has nothing', async () => {
    const sigs = raw<{ result: { function: Record<string, OpenchainSig[] | null> } }>('openchain-lookup-execute-transfer-unknown-null').result.function
    const s = stubSources({ sourcify: { resolvedAbi: async () => null }, openchain: { lookupFunctions: async () => sigs } })
    const o = await decodeAction(await subjectOf(JSON.stringify({ to: swapCall.to, data: swapCall.data })), s)
    expect(o.action).toMatchObject({ type: 'call', functionName: 'execute', decodedWith: 'openchain' })
  })

  it('unknown selector -> DECODE_UNKNOWN_FUNCTION warn; both sources down -> failed', async () => {
    const input = JSON.stringify({ to: '0x8571C129F335832F6BBC76D49414AD2B8371a422', data: '0x9f8e7d6c' })
    const unknown = stubSources({ sourcify: { resolvedAbi: async () => null }, openchain: { lookupFunctions: async () => ({ '0x9f8e7d6c': null }) } })
    const r1 = decodeCheck(await decodeAction(await subjectOf(input), unknown), new Map(), NOW)
    expect(r1.status).toBe('ok')
    expect(codes(r1)).toEqual(['DECODE_UNKNOWN_FUNCTION:warn'])
    const r2 = decodeCheck(await decodeAction(await subjectOf(input), stubSources()), new Map(), NOW)
    expect(r2.status).toBe('failed')
  })

  it('decodeWithCandidates skips junk collisions that do not round-trip', () => {
    const data = encodeFunctionData({ abi: ERC, functionName: 'setApprovalForAll', args: [DRAINER_EOA, true] })
    const sigs: OpenchainSig[] = [
      { name: 'niceFunctionHerePlzClick943230089(address,bool)', filtered: false, hasVerifiedContract: false },
      { name: 'setApprovalForAll(address,bool)', filtered: false, hasVerifiedContract: true },
    ]
    expect(decodeWithCandidates(data, sigs)?.ambiguous).toBe(true)
  })

  it('empty data is a native transfer; address inputs skip decode', async () => {
    const o = await decodeAction(await subjectOf(caseInput('poisoning-wbtc-68m-legit-counterparty')), stubSources())
    expect(o.action).toEqual({ type: 'nativeTransfer', to: '0xd9a1b0b1e1ae382dbdc898ea68012ffcb2853a91', value: 50000000000000000n })
    const skipped = decodeCheck(await decodeAction({ kind: 'address', address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' }, stubSources()), new Map(), NOW)
    expect(skipped.status).toBe('skipped')
  })
})
