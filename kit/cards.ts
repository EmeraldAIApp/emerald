// Copy of every image in the X kit (English, docs/copy-v2.md: plain words, Emerald in the third person, no em dash).
// Book quotes verified against https://vitalik.eth.limo/snowmoon/html/chapter-{6,16}.html on 2026-09-30.
// Demo facts: engine/test/fixtures/cases/permit2-batch-inferno-drainer.json.
import type { BannerSpec, CardSpec, VerdictMini } from './templates.js'

export const NOT_AFFILIATED = 'Not affiliated with Vitalik Buterin.'
export const BOOK_LEGAL = `Snowmoon is a novel by Vitalik Buterin, released under GPL v3. ${NOT_AFFILIATED}`

/** The "Try a real scam: Permit2 drainer" verdict, as the checker shows it. */
export const DRAINER_VERDICT: VerdictMini = {
  status: 'Emerald · Permit2 signature request',
  headline: "Don't sign.",
  reasons: [
    'Lets a plain wallet move all your USDC until 2033.',
    'GoPlus and Blockscout flag it: Inferno Drainer.',
  ],
}

export const shortCa = (ca: string): string => `${ca.slice(0, 6)}…${ca.slice(-4)}`

/** Cards for the posts. The ones that show the CA only exist once there is a CA. */
export function cards(ca: string | null): CardSpec[] {
  const tray = ca ? `CA: ${shortCa(ca)}` : 'CA: soon'
  const list: CardSpec[] = [
    {
      id: 'card-book-16',
      kind: 'book',
      tray,
      chapter: 'Snowmoon · chapter 16 · 3724 Firemoon 25',
      headline: 'Emerald comes from Snowmoon.',
      quote: ['He asked Emerald to search for the receiving address online.', 'Febric clicked "Confirm".'],
      coda: 'In the book, Emerald checks and the person decides. Same here: you sign, Emerald never does.',
      legal: BOOK_LEGAL,
    },
    {
      id: 'card-book-6',
      kind: 'book',
      tray,
      chapter: 'Snowmoon · chapter 6 · 3724 Rainmoon 12',
      headline: "Red means don't sign.",
      quote: ['The outline turned red. Payment declined.'],
      coda: "In chapter 6 a payment fails and Gladias's watch outline turns red. Emerald shows the same red when your wallet asks you to sign something dangerous.",
      legal: BOOK_LEGAL,
      verdict: DRAINER_VERDICT,
    },
    {
      id: 'card-how',
      kind: 'how',
      tray,
      headline: 'How a check works',
      steps: [
        { n: '01', title: 'You paste it', text: 'A transaction, a signature request, an address or a token contract.' },
        {
          n: '02',
          title: 'Fixed rules set the color',
          text: 'Five checks on live Ethereum data: the call, a simulation, lookalike addresses, scam reports and the token.',
        },
        { n: '03', title: 'An AI explains it', text: 'In plain words, including what it couldn’t verify.' },
      ],
      foot: 'The AI can’t change the color. Only the rules set it.',
      legal: 'Open source, AGPL-3.0. Not audited. Emerald can be wrong.',
    },
  ]
  if (ca) {
    list.push(
      {
        id: 'card-live',
        kind: 'lineup',
        tray,
        headline: ['7 $EMERALD.', 'Only one answers.'],
        sub: 'There are at least seven tokens called $EMERALD. This is the one with a working checker.',
        lit: 'This one works.',
        ca: `CA: ${ca}`,
        legal: NOT_AFFILIATED,
      },
      {
        id: 'card-fees',
        kind: 'fees',
        tray,
        headline: '2 % fee per trade. Half pays for the checks.',
        rows: [
          ['Emerald checks', '1 %'],
          ['Stockereum', '1 %'],
        ],
        total: ['Total fee', '2 %'],
        quotas: ['Anyone: 5 free checks a day', 'Hold 100k $EMERALD: 100 a day', 'Hold 1M $EMERALD: no daily limit'],
        note: 'A live counter on the site shows the fees and what the checks cost.',
        ca: `CA: ${ca}`,
      },
    )
  }
  return list
}

export function banner(ca: string | null): BannerSpec {
  return {
    headline: ['7 $EMERALD.', 'Only one answers.'],
    tagline: 'Know what you’re signing · Ethereum',
    tray: ca ? `CA: ${ca}` : 'CA: soon',
    verdict: DRAINER_VERDICT,
  }
}
