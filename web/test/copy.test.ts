// The exact copy of brief §6 (copy v2, docs/copy-v2.md) is a contract for the classic landing (/classic/): if the HTML drifts, the test fails.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const html = readFileSync(fileURLToPath(new URL('../classic/index.html', import.meta.url)), 'utf8')
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const COPY: Record<string, string[]> = {
  meta: [
    '<title>Emerald · Know what you’re signing</title>',
    'content="Emerald · Know what you’re signing"',
    'content="A transaction checker for Ethereum, from the novel Snowmoon. Fixed rules set the verdict, and an AI explains it in plain words."',
    'aria-label="Checks counter"',
  ],
  nav: ['Skip to the checker', 'EMERALD', 'Try it', 'The book', 'How it works', 'Token', 'Roadmap', 'Ethereum ·', 'Check a tx'],
  hero: [
    'Meldan, Veridia · 3724 Snowmoon 3',
    'Know what you’re signing.',
    'Paste the transaction or signature your wallet is asking for. Emerald checks it against live Ethereum data and tells you in plain words what it does, and what it couldn’t verify.',
    'Emerald never asks you to sign anything and never touches your keys.',
    'EMERALD · Ethereum',
    'Ready.',
    'Nothing checked yet',
    'Paste something below, or try one of these real cases.',
    'Try a real case:',
    'Check',
  ],
  lineup: [
    '7 $EMERALD. Only one answers.',
    'There are at least seven tokens called $EMERALD. This is the one with a working product: paste a transaction above and see for yourself.',
    'This one works.',
  ],
  book: [
    'Emerald comes from Snowmoon.',
    '“the local AI running from Gladias\'s hand device”',
    'Snowmoon · Chapter 1',
    'Read Snowmoon',
    'Chapter 16',
    'Meldan, Veridia · 3724 Firemoon 25',
    "A few ticks later, Febric's watch buzzed.",
    'He asked Emerald to search for the receiving address online.',
    'Febric clicked "Confirm".',
    'In the book, Emerald checks and the person decides. Same here: you sign, Emerald never does.',
    'Snowmoon is a novel by Vitalik Buterin, released under GPL v3. Emerald is not affiliated with Vitalik Buterin.',
  ],
  how: [
    'How a check works',
    '01 You paste it',
    'A transaction, a signature request, an address or a token contract.',
    '02 Fixed rules set the color',
    'Five checks run on live data: what the call does, a simulation of the result, lookalike addresses, scam reports, and the token itself. The same input always gets the same color.',
    '03 An AI explains it',
    'A language model turns the result into plain words and says what it couldn’t verify.',
    'The AI can’t change the color. Only the rules set it.',
  ],
  token: [
    '2 % fee per trade. Half pays for the checks.',
    'Trade fee',
    // Receipt rows exactly as the brief writes them; its " · " is the label | amount cell boundary.
    ...['Emerald checks · 1 %', 'Stockereum · 1 %', 'Total fee · 2 %'].map((row) => row.replace(' · ', ' ')),
    'Spent on checks',
    '0.000 ETH',
    'AI cost',
    'Checks run',
    'Anyone: 5 free checks a day',
    'Hold 100k $EMERALD: 100 a day',
    'Hold 1M $EMERALD: no daily limit',
  ],
  roadmap: [
    'What’s next',
    'Now Live: paste anything and get a verdict with the reasons.',
    'Next Testnet: the reputation-backed loan from chapter 6.',
    'Then Later: a version that runs fully in your browser, so nothing you paste leaves your device.',
    'Reputation-backed loan request',
    'TESTNET',
    'Submit',
    'Not live yet. Coming to testnet next.',
    'Emerald never asks you to sign anything.',
    'Not audited. Emerald can be wrong, so always read the reasons.',
  ],
}

// Copy v1 lines that copy v2 replaced: Emerald no longer speaks as "I", and it does not claim to run locally.
const RETIRED = [
  'I read it before you sign it.',
  'I never ask for your signature.',
  'EMERALD · local',
  'Listening.',
  'This is me.',
  'I was written into Snowmoon.',
  'Rules decide. I explain.',
  'pays for my thinking',
  'Next, I move closer to you.',
  'Open Emerald',
  'Model spend',
  'Half of it pays',
]

describe('exact copy of brief §6', () => {
  for (const [section, lines] of Object.entries(COPY)) {
    it(section, () => {
      for (const line of lines) expect(section === 'meta' ? html : text, line).toContain(line)
    })
  }

  it('copy v1 lines are gone', () => {
    for (const line of RETIRED) expect(text, line).not.toContain(line)
  })

  it('the meta description and the counter label no longer use the old wording', () => {
    for (const old of ['Rules decide. The model explains.', 'A transaction guardian', 'Compute counter']) expect(html, old).not.toContain(old)
  })

  it('the chat input carries the brief placeholder, and a shorter one for phones', () => {
    expect(html).toContain('placeholder="Paste a transaction, signature, address or token"')
    expect(html).toContain('data-placeholder-narrow="Paste a transaction or address"')
  })

  it('no em dash in the visible text', () => {
    expect(text).not.toContain('—')
  })

  it('the hooks main.ts uses exist', () => {
    for (const hook of ['data-screen', 'data-chat-form', 'id="chat-input"', 'data-chips', 'data-quota', 'data-announce', 'data-stage', 'data-nav-toggle']) {
      expect(html, hook).toContain(hook)
    }
  })
})
