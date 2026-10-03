// "Try a real case": REAL mainnet inputs, two that end red and two that end green. Every one with a caseName is an exact
// copy of its case in engine/test/fixtures/cases (web/test/samples.test.ts checks it byte by byte, and the level).
import type { Hex } from './wire.js'

export type SampleId = 'permit2-drainer' | 'poisoned-address' | 'fake-airdrop' | 'uniswap-swap' | 'usdc-approval'

export interface Sample {
  id: SampleId
  label: string
  /** The color the real engine gives it (the chip carries it). */
  level: 'red' | 'green'
  /** Case name in engine/test/fixtures/cases (without .json), if any. */
  caseName?: string
  input: string
  userAddress?: Hex
  /** Line shown in the panel while reading: where the case comes from. */
  note: string
}

export const SAMPLES: Record<SampleId, Sample> = {
  'permit2-drainer': {
    id: 'permit2-drainer',
    label: 'Permit2 drainer',
    level: 'red',
    caseName: 'permit2-batch-inferno-drainer',
    // Real PermitBatch signed by the victim 0x13C7…DF4C in June 2023; the spender is Inferno Drainer.
    input: JSON.stringify({
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        PermitBatch: [
          { name: 'details', type: 'PermitDetails[]' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' },
        ],
      },
      primaryType: 'PermitBatch',
      domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
      message: {
        details: [
          {
            token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            amount: '1461501637330902918203684832716283019655932542975',
            expiration: '2002758737',
            nonce: '0',
          },
        ],
        spender: '0x00001f78189bE22C3498cFF1B8e02272C3220000',
        sigDeadline: '2002758737',
      },
    }),
    userAddress: '0x13C7c033175F000C931b718157894F2D0389DF4C',
    note: 'Real signature request, June 2023. The drainer took the victim’s USDC one block later.',
  },
  'poisoned-address': {
    id: 'poisoned-address',
    label: 'Poisoned address',
    level: 'red',
    caseName: 'poisoning-wbtc-68m-flagged-lookalike',
    // Byte-for-byte calldata of the 2024-05-03 theft (tx 0x3374abc5…): 1155.28802767 WBTC to the lookalike.
    input: JSON.stringify({
      from: '0x1E227979f0b5BC691a70DEAed2e0F39a6F538FD5',
      to: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      value: '0x0',
      data: '0xa9059cbb000000000000000000000000d9a1c3788d81257612e2581a6ea0ada244853a910000000000000000000000000000000000000000000000000000001ae60da1cf',
    }),
    userAddress: '0x1E227979f0b5BC691a70DEAed2e0F39a6F538FD5',
    note: 'Real transfer, May 2024: 1,155 WBTC to a lookalike address.',
  },
  'fake-airdrop': {
    id: 'fake-airdrop',
    label: 'Fake airdrop',
    level: 'red',
    // Fake DAI (GoPlus fake_token -> real DAI 0x6b17…1d0f). Verified 2026-09-30 on Blockscout: 1 "DAI" reached the
    // WBTC case victim unrequested on 2025-07-08 (tx 0x4979e7ca…, from 0x191C9dC2…).
    input: '0x7362De96703aB797156f3B1e3716323A358D7c76',
    userAddress: '0x1E227979f0b5BC691a70DEAed2e0F39a6F538FD5',
    note: 'Real fake DAI, airdropped to a known victim in July 2025.',
  },
  'uniswap-swap': {
    id: 'uniswap-swap',
    label: 'Uniswap swap',
    level: 'green',
    caseName: 'swap-uniswap-universal-router-txhash',
    // Mined swap of 2026-09-30 (block 26092508): 550 USDC for FET through Uniswap's Universal Router.
    input: '0x020419afcdb33f575ba84361e3125b832c11a2d22fc187132a87a4b4baa02f8e',
    userAddress: '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f',
    note: 'Real swap, September 2026: 550 USDC for FET on Uniswap.',
  },
  'usdc-approval': {
    id: 'usdc-approval',
    label: 'USDC approval',
    level: 'green',
    caseName: 'approve-exact-usdc-to-permit2',
    // Real approve of 2026-09-30 (block 26092506): exactly the 650.39 USDC the wallet held, to Permit2, right before the swap.
    input: JSON.stringify({
      from: '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f',
      to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      value: '0x0',
      data: '0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba30000000000000000000000000000000000000000000000000000000026c428ab',
    }),
    userAddress: '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f',
    note: 'Real approval, September 2026: exactly 650 USDC to Uniswap’s Permit2, used for a swap a few seconds later.',
  },
}

/** Visible chips: two real cases that end red, two that end green. "fake-airdrop" stays out until the real engine marks it red. */
export const CHIPS: SampleId[] = ['permit2-drainer', 'poisoned-address', 'uniswap-swap', 'usdc-approval']
