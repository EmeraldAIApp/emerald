// DEVELOPMENT ONLY (npm run dev:mock). Verdicts BUILT BY HAND from the verified facts of the real cases
// (engine/test/fixtures/cases/*.json, field "why"), to build the landing without the plan 1 backend.
// They are not engine output and are never served in production: vite.config.ts only loads the mock with --mode mock.
import { SAMPLES } from '../src/chat/samples.js'
import type { WireInput, WireVerdict } from '../src/chat/wire.js'

export interface MockAnswer { verdict: WireVerdict; explanation: string }

const drainerJson = JSON.parse(SAMPLES['permit2-drainer'].input) as {
  types: Record<string, { name: string; type: string }[]>
  primaryType: string
  domain: Record<string, unknown>
  message: Record<string, unknown>
}
const drainerInput: WireInput = {
  kind: 'typedData',
  typedData: { domain: drainerJson.domain, types: drainerJson.types, primaryType: drainerJson.primaryType, message: drainerJson.message },
}
const DRAINER = '0x00001f78189bE22C3498cFF1B8e02272C3220000'
const POISONER = '0xd9A1C3788D81257612E2581A6ea0aDa244853a91'

export const MOCK_ANSWERS: Record<string, MockAnswer> = {
  // The two real cases that end green, as the live engine answered them (2026-10-02, smoke-live with the cases' date).
  [SAMPLES['uniswap-swap'].input]: {
    verdict: {"level": "green", "headline": "Looks fine.", "reasons": [{"code": "DECODED", "check": "decode", "severity": "ok", "text": "Calls execute() on the verified contract 0x23617e…29de85.", "evidenceUrl": "https://eth.blockscout.com/address/0x23617e59a5925b2a4bf75d73ff6711cd0b29de85"}, {"code": "SIM_BALANCE_CHANGES", "check": "simulate", "severity": "ok", "text": "You send 550000000 raw units of token 0xa0b869…06eb48; you receive 2441385022776743077841 raw units of token 0xaea46a…41ad85."}, {"code": "POISONING_CLEAR", "check": "poisoning", "severity": "ok", "text": "No look-alike of 0x23617e59a5925b2a4bf75d73ff6711cd0b29de85 in your history."}, {"code": "KNOWN_NAME", "check": "labels", "severity": "ok", "text": "Blockscout names 0x23617e…29de85 \"UniversalRouter\".", "evidenceUrl": "https://eth.blockscout.com/address/0x23617e59a5925b2a4bf75d73ff6711cd0b29de85"}, {"code": "TOKEN_OK", "check": "token", "severity": "ok", "text": "GoPlus: FET (0xaea46a…41ad85) can be sold.", "evidenceUrl": "https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0xaea46a60368a7bd060eec7df8cba43b7ef41ad85"}], "checksOk": ["decode", "simulate", "poisoning", "labels", "token"], "checksFailed": [], "input": {"kind": "txHash", "hash": "0x020419afcdb33f575ba84361e3125b832c11a2d22fc187132a87a4b4baa02f8e"}, "chainId": 1, "engineVersion": "mock"},
    explanation:
      "Looks fine. This is a swap that already happened on Uniswap: the wallet sent 550 USDC and got back about 2,441 FET. The contract it called is Uniswap's Universal Router, verified and named on Blockscout, and GoPlus shows FET can be sold.\n\nCouldn't check: nothing.",
  },
  [SAMPLES['usdc-approval'].input]: {
    verdict: {"level": "green", "headline": "Looks fine.", "reasons": [{"code": "APPROVE_LIMITED", "check": "decode", "severity": "ok", "text": "Approves 650389675 raw units of 0xa0b869…06eb48 to 0x000000…c78ba3.", "evidenceUrl": "https://eth.blockscout.com/address/0x000000000022d473030f116ddee9f6b43ac78ba3"}, {"code": "SIM_NO_BALANCE_CHANGE", "check": "simulate", "severity": "ok", "text": "No ETH or tokens leave or enter your wallet in this transaction."}, {"code": "POISONING_CLEAR", "check": "poisoning", "severity": "ok", "text": "No look-alike of 0x000000000022d473030f116ddee9f6b43ac78ba3 in your history."}, {"code": "KNOWN_NAME", "check": "labels", "severity": "ok", "text": "Blockscout names 0xa0b869…06eb48 \"USDC Token\".", "evidenceUrl": "https://eth.blockscout.com/address/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"}, {"code": "KNOWN_NAME", "check": "labels", "severity": "ok", "text": "Blockscout names 0x000000…c78ba3 \"Uniswap Protocol: Permit2\".", "evidenceUrl": "https://eth.blockscout.com/address/0x000000000022d473030f116ddee9f6b43ac78ba3"}], "checksOk": ["decode", "simulate", "poisoning", "labels"], "checksFailed": [], "input": {"kind": "tx", "tx": {"to": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "data": "0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba30000000000000000000000000000000000000000000000000000000026c428ab", "value": "0", "from": "0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f"}}, "chainId": 1, "engineVersion": "mock"},
    explanation:
      "Looks fine. This lets Uniswap's Permit2 contract move up to 650.39 USDC from this wallet, exactly the amount it held, not an unlimited amount. Permit2 is the standard contract Uniswap uses for swaps, and nothing leaves the wallet in this step.\n\nCouldn't check: nothing.",
  },
  [SAMPLES['permit2-drainer'].input]: {
    verdict: {
      level: 'red',
      headline: "Don't sign.",
      reasons: [
        {
          code: 'PERMIT2_UNKNOWN_SPENDER',
          check: 'decode',
          severity: 'danger',
          text: `Permit2 batch permit: ${DRAINER} can move up to all your USDC until 2033. The spender is a wallet, not a contract.`,
          evidenceUrl: `https://eth.blockscout.com/address/${DRAINER}`,
        },
        {
          code: 'LABEL_FLAGGED_GOPLUS',
          check: 'labels',
          severity: 'danger',
          text: 'GoPlus flags the spender for phishing (SlowMist, ScamSniffer, BlockSec).',
          evidenceUrl: `https://api.gopluslabs.io/api/v1/address_security/${DRAINER}?chain_id=1`,
        },
        {
          code: 'LABEL_FLAGGED_BLOCKSCOUT',
          check: 'labels',
          severity: 'danger',
          text: 'Blockscout marks the spender as a scam: Inferno Drainer.',
          evidenceUrl: `https://eth.blockscout.com/address/${DRAINER}`,
        },
      ],
      checksOk: ['decode', 'poisoning', 'labels', 'token'],
      checksFailed: [],
      input: drainerInput,
      chainId: 1,
      engineVersion: 'mock',
    },
    explanation:
      "Don't sign this. It is a Permit2 batch permit that lets 0x00001f78…0000 move up to all of your USDC until June 2033. " +
      'That address is a plain wallet, and GoPlus and Blockscout both flag it as Inferno Drainer. ' +
      'The drainer used this exact signature to take the victim’s USDC in June 2023.\n\nCouldn\'t check: a simulation, because a signature is not a transaction.',
  },
  [SAMPLES['poisoned-address'].input]: {
    verdict: {
      level: 'red',
      headline: "Don't sign.",
      reasons: [
        {
          code: 'POISONING_LOOKALIKE',
          check: 'poisoning',
          severity: 'danger',
          text: `The recipient ${POISONER} copies the first and last characters of 0xd9A1b0B1e1aE382DbDc898Ea68012FfcB2853a91, a wallet you really paid. It entered your history through a fake transfer.`,
          evidenceUrl: `https://eth.blockscout.com/address/${POISONER}`,
        },
        {
          code: 'LABEL_FLAGGED_GOPLUS',
          check: 'labels',
          severity: 'danger',
          text: 'GoPlus flags the recipient for phishing (SlowMist).',
          evidenceUrl: `https://api.gopluslabs.io/api/v1/address_security/${POISONER}?chain_id=1`,
        },
        {
          code: 'LABEL_FLAGGED_BLOCKSCOUT',
          check: 'labels',
          severity: 'danger',
          text: 'Blockscout marks the recipient as a scam (Fake_Phishing327990).',
          evidenceUrl: `https://eth.blockscout.com/address/${POISONER}`,
        },
      ],
      checksOk: ['decode', 'poisoning', 'labels', 'token'],
      checksFailed: ['simulate'],
      input: {
        kind: 'tx',
        tx: {
          from: '0x1E227979f0b5BC691a70DEAed2e0F39a6F538FD5',
          to: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
          data: '0xa9059cbb000000000000000000000000d9a1c3788d81257612e2581a6ea0ada244853a910000000000000000000000000000000000000000000000000000001ae60da1cf',
          value: '0',
        },
      },
      chainId: 1,
      engineVersion: 'mock',
    },
    explanation:
      "Don't sign this. It sends 1,155.29 WBTC to 0xd9A1C378…53a91, which only looks like 0xd9A1b0B1…53a91, the wallet you paid that same morning. " +
      'The lookalike got into your history through a fake transfer the attacker planted. This matches the May 2024 poisoning that cost about 68 million dollars.' +
      '\n\nCouldn\'t check: the simulation, because this wallet no longer holds that WBTC.',
  },
  // A pasted address with no wallet connected: like the real engine (plan 1, R1) it cannot compare it with the
  // user's history, so it is yellow with POISONING_NO_USER (warn) and "poisoning" is neither ok nor failed.
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045': {
    verdict: {
      level: 'yellow',
      headline: 'Check before you sign.',
      reasons: [
        {
          code: 'POISONING_NO_USER',
          check: 'poisoning',
          severity: 'warn',
          text: "I couldn't compare this address with your history. Connect your wallet or paste your own address to check for look-alikes.",
        },
        { code: 'LABELS_CLEAR', check: 'labels', severity: 'ok', text: 'No flags on GoPlus or Blockscout. ENS: vitalik.eth.' },
      ],
      checksOk: ['labels'],
      checksFailed: [],
      input: { kind: 'address', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
      chainId: 1,
      engineVersion: 'mock',
    },
    explanation:
      'This address has no flags on GoPlus or Blockscout and resolves to vitalik.eth. It is a wallet with an EIP-7702 delegation, not a deployed contract. ' +
      'It could not be compared with your history, so connect your wallet or paste your own address to check for look-alikes.' +
      '\n\nCouldn\'t check: whether it imitates an address in your history, because your own address is unknown.',
  },
  // The $EMERALD contract itself (the mock stands 0x5aAe… in for the CA): green "This is me." even with a warn
  // reason on screen (plan 1, R2 and decision 13). The young-contract warning stays visible.
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed': {
    verdict: {
      level: 'green',
      headline: 'This is me.',
      reasons: [
        {
          code: 'CONTRACT_NEW',
          check: 'labels',
          severity: 'warn',
          text: '0x5aaeb605…1beaed is a contract created 1 day(s) ago (less than 7).',
          evidenceUrl: 'https://eth.blockscout.com/address/0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
        },
        { code: 'TOKEN_OK', check: 'token', severity: 'ok', text: 'GoPlus: (0x5aaeb605…1beaed) can be sold.' },
      ],
      checksOk: ['labels', 'token'],
      checksFailed: [],
      input: { kind: 'address', address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' },
      chainId: 1,
      engineVersion: 'mock',
    },
    explanation:
      'This is the $EMERALD token contract itself. GoPlus finds no honeypot and no taxes. ' +
      'The contract is one day old, which is normal right after a launch. The warning stays on screen so you can decide.' +
      '\n\nCouldn\'t check: nothing.',
  },
}

/** Generic answer for any other input in the mock: yellow with one source down (like the plan 1 stub). */
export function genericAnswer(raw: string): MockAnswer {
  return {
    verdict: {
      level: 'yellow',
      headline: 'Check before you sign.',
      reasons: [{ code: 'SOURCE_FAILED', check: 'simulate', severity: 'warn', text: 'Mock mode: there is no engine behind this page.' }],
      checksOk: [],
      checksFailed: ['simulate'],
      input: { kind: 'unknown', raw },
      chainId: 1,
      engineVersion: 'mock',
    },
    explanation: 'This is the local mock, not the real engine.\n\nCouldn\'t check: everything.',
  }
}
