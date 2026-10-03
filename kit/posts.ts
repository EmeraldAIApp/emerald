// The X kit copy (English, plain and concrete, docs/copy-v2.md: no slogans, no mirrored lines, no "I" as Emerald,
// no em dash). Order = posting order.
// Phases: 'pre' goes out with the product and the demo live BEFORE the token (CA: soon); 'launch' only after
// scripts/verify-launch.ts passes; 'post' after the first public claim.
// Book facts checked against https://vitalik.eth.limo/snowmoon/html/chapter-{6,16}.html (2026-09-30).
// Demo facts: engine/test/fixtures/cases/permit2-batch-inferno-drainer.json ("why").

export type Phase = 'pre' | 'launch' | 'post'
export type VarName =
  | 'SITE'
  | 'REPO'
  | 'CA'
  | 'CLAIM_ETH'
  | 'CLAIM_TX_URL'
  | 'LOCK_AMOUNT'
  | 'LOCK_UNTIL'
  | 'LOCK_URL'
  | 'AUTHOR_AMOUNT'
  | 'AUTHOR_TX_URL'
export type Vars = Partial<Record<VarName, string>>

export interface Post {
  id: string
  phase: Phase
  media: string | null // file in kit/out/
  text: string
}

export const NOT_AFFILIATED = 'Not affiliated with Vitalik Buterin.'
export const CA_SOON = 'CA: soon'

export const PROFILE = {
  name: 'Emerald',
  location: 'Meldan, Veridia',
  bio: `Paste what your wallet asks you to sign: Emerald checks it on Ethereum and explains it plainly. From the novel Snowmoon. ${NOT_AFFILIATED}`,
}

export const POSTS: Post[] = [
  {
    // Pinned on the profile from day one (before the token): what Emerald is, in one read.
    id: 'pinned',
    phase: 'pre',
    media: 'card-pinned.jpg',
    text: `Paste what your wallet asks you to sign.

Emerald reads it on live Ethereum data and tells you plainly what it does, and what it couldn't check.

5 free checks a day. It never asks you to sign.

{SITE}
${CA_SOON}`,
  },
  {
    id: 'demo',
    phase: 'pre',
    media: 'demo.mp4',
    text: `Emerald shows what a signature does before you sign it.

This one is real: a Permit2 batch permit from Inferno Drainer, June 2023. It lets a plain wallet move all your USDC until 2033. The drainer used it one block later.

Verdict: Don't sign.

{SITE}
${CA_SOON}`,
  },
  {
    id: 'book-16',
    phase: 'pre',
    media: 'card-book-16.jpg',
    text: `Emerald comes from Vitalik Buterin's novel Snowmoon. In chapter 16 Febric gets a transaction request on his watch. He asks Emerald to look up the receiving address online, then clicks Confirm.

Same here: Emerald checks, you decide.

${NOT_AFFILIATED}
${CA_SOON}`,
  },
  {
    id: 'how',
    phase: 'pre',
    media: 'card-how.jpg',
    text: `How a check works:
1. Paste a transaction, signature, address or token.
2. Five checks run on live Ethereum data. Fixed rules set the color.
3. An AI explains it plainly. It can't change the color.

AGPL-3.0: {REPO}
Not audited. Emerald can be wrong.
${CA_SOON}`,
  },
  {
    id: 'book-6',
    phase: 'pre',
    media: 'card-book-6.jpg',
    text: `Snowmoon, chapter 6: Gladias pays with his watch, the outline turns red, and the payment is declined.

Emerald does the same for your wallet. Red: don't sign. Yellow: check before you sign. Green: looks fine.

${NOT_AFFILIATED}
${CA_SOON}`,
  },
  // Batch 2 (2026-10-03): more pre-launch posts. Nothing red, no warning stamps (team rule for pre-launch posts).
  // Facts: fixtures swap-uniswap-universal-router-txhash, approve-exact-usdc-to-permit2, poisoning-wbtc-68m-*.
  {
    id: 'room',
    phase: 'pre',
    media: 'room-boot.mp4',
    text: `An old PC in a snowy room. Press power.

Inside is Emerald: paste what your wallet asks you to sign, and it tells you what it really does before you sign it.

{SITE}
${CA_SOON}`,
  },
  {
    id: 'green',
    phase: 'pre',
    media: 'demo-swap.mp4',
    text: `Not every check ends in a warning.

A real Uniswap swap from September 30: 550 USDC out, 2,441 FET in, a verified router, no scam reports. Five checks, all green.

Emerald tells you when things look fine, and why.

{SITE}
${CA_SOON}`,
  },
  {
    id: 'paste',
    phase: 'pre',
    media: 'card-paste.jpg',
    text: `What you can paste into Emerald:

- a transaction (hash or raw call)
- a signature request (Permit, Permit2, approvals)
- an address, before you send to it
- a token contract, before you buy it

5 free checks a day. No wallet, no sign-up.

{SITE}
${CA_SOON}`,
  },
  {
    id: 'lookalike',
    phase: 'pre',
    media: 'card-lookalike.jpg',
    text: `Same first 4, same last 4, different address.

On May 3, 2024 a lookalike was planted in a wallet's history, and 1,155 WBTC (about $68M) went to it.

Connect your wallet and Emerald compares each address with your own history.

{SITE}
${CA_SOON}`,
  },
  {
    id: 'approval',
    phase: 'pre',
    media: 'card-green.jpg',
    text: `Approvals have a size.

This real one gives Uniswap's Permit2 exactly 650.39 USDC, not unlimited. Emerald reads the amount, the spender and its history, and says it looks fine.

Paste yours before you sign.

{SITE}
${CA_SOON}`,
  },
  {
    // The launch moment, first post once scripts/verify-launch.ts passes. Pasting the CA gives the green "This is me."
    id: 'launch',
    phase: 'launch',
    media: 'card-launch.jpg',
    text: `$EMERALD is live.

It's the token behind Emerald, the wallet checker at {SITE}. 1 % of each trade pays for the checks.

Paste the CA into Emerald and see what it says.

CA: {CA}

${NOT_AFFILIATED}`,
  },
  {
    id: 'fees',
    phase: 'launch',
    media: 'card-fees.jpg',
    text: `$EMERALD has a 2 % fee per trade. 1 % pays for the checks (the AI and data behind each verdict). The other 1 % goes to Stockereum, the launch platform.

A live counter on the site shows fees and check costs.

CA: {CA}
{SITE}`,
  },
  {
    id: 'first-claim',
    phase: 'post',
    media: null,
    text: `First fee claim: {CLAIM_ETH} ETH from $EMERALD trading fees, claimed on-chain to pay for the checks.

{CLAIM_TX_URL}

The counter on the site shows the fees and what the checks cost.

CA: {CA}
{SITE}`,
  },
  // After launch (2026-10-03). The burn happened: tx 0x6e34b8b1…3fd5, 55,000,000 EMERALD from the creator wallet to
  // 0x…dEaD (5.5 % of the 1,000,000,000 supply). Author share: tx 0x9f640bf6…7415, 29,000,000 EMERALD (2.9 %) to
  // 0xd8dA…6045. The lock post names no amount (team decision); post it once the lock tx exists.
  {
    id: 'burn',
    phase: 'post',
    media: 'card-burn.jpg',
    text: `55,000,000 $EMERALD burned.

That's 5.5 % of the supply, from the dev buy, sent to the dead address. Nobody can move it again.

Tx: https://etherscan.io/tx/0x6e34b8b1993f74f2678cc735ee3146b2427297396d4246fd4c4e8f4435cf3fd5

CA: {CA}
{SITE}`,
  },
  {
    id: 'lock',
    phase: 'post',
    media: 'card-lock.jpg',
    text: `The dev tokens are locked.

The lock is on-chain: {LOCK_URL}

Liquidity was already locked forever by Stockereum at launch.

CA: {CA}
{SITE}`,
  },
  {
    id: 'author',
    phase: 'post',
    media: 'card-author.jpg',
    text: `29,000,000 $EMERALD (2.9 % of supply) went to Vitalik Buterin, author of Snowmoon, the novel Emerald comes from.

His to keep, sell or give away. He isn't involved.

Tx: https://etherscan.io/tx/0x9f640bf6950ff982aaf3dbed74d3fde59b830baab04b191f7428913666c97415
${NOT_AFFILIATED}
CA: {CA}`,
  },
]

/** Worst-case values used to check the 280 limit before the real ones exist. */
export const WORST_CASE: Required<Vars> = {
  SITE: 'https://emerald.example',
  REPO: 'https://github.com/example/emerald',
  CA: '0x' + 'f'.repeat(40),
  CLAIM_ETH: '1234.5678',
  CLAIM_TX_URL: 'https://etherscan.io/tx/0x' + 'f'.repeat(64),
  LOCK_AMOUNT: '58,312,710',
  LOCK_UNTIL: 'September 30, 2027',
  LOCK_URL: 'https://app.uncx.network/lockers/token/chain/1/address/0x' + 'f'.repeat(40),
  AUTHOR_AMOUNT: '10,000,000',
  AUTHOR_TX_URL: 'https://etherscan.io/tx/0x' + 'f'.repeat(64),
}

export function renderPost(p: Post, vars: Vars): string {
  const out = p.text.replace(/\{([A-Z_]+)\}/g, (m, k: string) => vars[k as VarName] ?? m)
  const left = out.match(/\{[A-Z_]+\}/g)
  if (left) throw new Error(`post ${p.id}: missing ${left.join(', ')}`)
  return out
}
