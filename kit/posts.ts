// The X kit copy (English, plain and concrete, docs/copy-v2.md: no slogans, no mirrored lines, no "I" as Emerald,
// no em dash). Order = posting order.
// Phases: 'pre' goes out with the product and the demo live BEFORE the token (CA: soon); 'launch' only after
// scripts/verify-launch.ts passes; 'post' after the first public claim.
// Book facts checked against https://vitalik.eth.limo/snowmoon/html/chapter-{6,16}.html (2026-09-30).
// Demo facts: engine/test/fixtures/cases/permit2-batch-inferno-drainer.json ("why").

export type Phase = 'pre' | 'launch' | 'post'
export type VarName = 'SITE' | 'REPO' | 'CA' | 'CLAIM_ETH' | 'CLAIM_TX_URL'
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
]

/** Worst-case values used to check the 280 limit before the real ones exist. */
export const WORST_CASE: Required<Vars> = {
  SITE: 'https://emerald.example',
  REPO: 'https://github.com/example/emerald',
  CA: '0x' + 'f'.repeat(40),
  CLAIM_ETH: '1234.5678',
  CLAIM_TX_URL: 'https://etherscan.io/tx/0x' + 'f'.repeat(64),
}

export function renderPost(p: Post, vars: Vars): string {
  const out = p.text.replace(/\{([A-Z_]+)\}/g, (m, k: string) => vars[k as VarName] ?? m)
  const left = out.match(/\{[A-Z_]+\}/g)
  if (left) throw new Error(`post ${p.id}: missing ${left.join(', ')}`)
  return out
}
