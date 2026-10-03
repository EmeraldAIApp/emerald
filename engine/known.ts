import type { Hex } from './types.js'

export const NATIVE_ETH: Hex = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
export const WETH: Hex = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
export const ZERO: Hex = '0x0000000000000000000000000000000000000000'

/** Amounts >= 2^128 count as unlimited (Permit2's max uint160 and max uint256 both exceed it). */
export const UNLIMITED = 2n ** 128n
export const MAX_UINT256 = 2n ** 256n - 1n
export const NEW_CONTRACT_MS = 7 * 24 * 3600 * 1000

/** Known spenders verified on 2026-09-30 (Sourcify + Blockscout). Lowercase. */
export const KNOWN_SPENDERS: ReadonlyMap<Hex, string> = new Map<Hex, string>([
  ['0x000000000022d473030f116ddee9f6b43ac78ba3', 'Uniswap Permit2'],
  ['0x66a9893cc07d91d95644aedd05d03f95e1dba8af', 'Uniswap Universal Router v4'],
  ['0x23617e59a5925b2a4bf75d73ff6711cd0b29de85', 'Uniswap Universal Router 2.1.2'],
])

/** topic0 of the events simulate decodes (verified against the eth_simulateV1 fixtures). */
export const TOPIC = {
  Transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  Approval: '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
  ApprovalForAll: '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31',
  WethDeposit: '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c',
  WethWithdrawal: '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65',
} as const

/** GoPlus address_security flags (strings '0'/'1'). */
export const GOPLUS_DANGER_FLAGS = [
  'phishing_activities',
  'stealing_attack',
  'sanctioned',
  'blacklist_doubt',
  'cybercrime',
  'money_laundering',
  'financial_crime',
  'honeypot_related_address',
  'fake_token',
  'darkweb_transactions',
  'malicious_mining_activities',
  'blackmail_activities',
  'fake_kyc',
  'fake_standard_interface',
] as const
export const GOPLUS_WARN_FLAGS = ['mixer', 'gas_abuse', 'reinit'] as const

/** Blockscout metadata service tags that count as a scam mark. */
export const SCAM_TAG_SLUGS: ReadonlySet<string> = new Set(['scam', 'phish--hack', 'exploit'])
