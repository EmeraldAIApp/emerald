import { describe, expect, it } from 'vitest'
import { banner, BOOK_LEGAL, cards, shortCa } from '../cards.js'
import { BANNER_ART, BANNER_ARTS, bannerArtHtml, bannerHtml, cardHtml, esc, hl, pfpHtml, type KitFonts } from '../templates.js'

const F: KitFonts = { pixel: 'data:,p', mono: 'data:,m', monoBold: 'data:,b' }
const W = 'data:image/png;base64,AA'
const CA = '0x' + 'a'.repeat(40)

describe('esc / hl', () => {
  it('escapes HTML metacharacters', () => {
    expect(esc('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;')
  })
  it('sets percentages in mono inside headlines', () => {
    expect(hl('2 % fee')).toBe('<span class="num">2 %</span> fee')
  })
})

describe('cards', () => {
  it('has only the pre-launch cards without a CA, all with "CA: soon" in the tray', () => {
    const list = cards(null)
    expect(list.map((c) => c.id)).toEqual(['card-book-16', 'card-book-6', 'card-how'])
    expect(list.every((c) => c.tray === 'CA: soon')).toBe(true)
    expect(JSON.stringify(list)).not.toContain('$EMERALD')
  })
  it('adds the launch cards, with the full CA, once there is one', () => {
    const list = cards(CA)
    expect(list.map((c) => c.id)).toEqual(['card-book-16', 'card-book-6', 'card-how', 'card-live', 'card-fees'])
    for (const c of list) {
      expect(c.tray).toBe(`CA: ${shortCa(CA)}`)
      if (c.kind === 'lineup' || c.kind === 'fees') expect(c.ca).toBe(`CA: ${CA}`)
    }
  })
  it('follows the copy rules: no em dash, no "I" as Emerald, book cards say Not affiliated, fee split right', () => {
    for (const c of cards(CA)) {
      const text = JSON.stringify(c)
      expect(text).not.toMatch(/[\u2014\u2013]/)
      expect(text).not.toMatch(/\b(I|I'm|me|my)\b/)
      expect(text).not.toContain('vitalik.eth')
      if (c.kind === 'book') expect(c.legal).toBe(BOOK_LEGAL)
      if (c.kind === 'lineup') expect(c.legal).toContain('Not affiliated with Vitalik Buterin.')
      if (c.kind === 'fees') {
        expect(c.rows).toEqual([['Emerald checks', '1 %'], ['Stockereum', '1 %']])
        expect(c.total).toEqual(['Total fee', '2 %'])
      }
    }
  })
  it('banner keeps the hook and says "CA: soon" until launch', () => {
    expect(banner(null).headline.join(' ')).toBe('7 $EMERALD. Only one answers.')
    expect(banner(null).tray).toBe('CA: soon')
    expect(banner(CA).tray).toBe(`CA: ${CA}`)
  })
})

describe('html', () => {
  it('book card carries the copy, the quote and the legal line', () => {
    const html = cardHtml(cards(null)[0]!, F, W)
    expect(html).toContain('Emerald comes from Snowmoon.')
    expect(html).toContain('Febric clicked &quot;Confirm&quot;.')
    expect(html).toContain('Not affiliated with Vitalik Buterin.')
    expect(html).toContain('CA: soon')
    expect(html).toContain(`url(${W})`)
  })
  it('chapter 6 card shows the red checker window', () => {
    const html = cardHtml(cards(null)[1]!, F, W)
    expect(html).toContain('win--red')
    expect(html).toContain("Don't sign.")
  })
  it('launch cards print the full CA', () => {
    for (const c of cards(CA).slice(3)) expect(cardHtml(c, F, W)).toContain(`CA: ${CA}`)
  })
  it('banner renders the headline, the CA line and embeds the fonts', () => {
    const html = bannerHtml(banner(CA), F, W)
    expect(html).toContain('7 $EMERALD.<br>Only one answers.')
    expect(html).toContain(`CA: ${CA}`)
    expect(html).toContain('url(data:,p) format("woff2")')
  })
  it('pfp is the pixel gem with its shadow, no text', () => {
    const html = pfpHtml(F, W)
    expect(html.match(/shape-rendering="crispEdges"/g)!.length).toBeGreaterThanOrEqual(3) // gem, shadow, sparkle
    expect(html).not.toMatch(/<(h1|p)\b/)
  })
})

describe('banner art', () => {
  it('has three variants, each with an emerald light inside the safe band and clear of the avatar', () => {
    expect(BANNER_ARTS).toEqual(['gem', 'windows', 'mosaic'])
    for (const v of BANNER_ARTS) {
      const { x, y } = BANNER_ART[v].halo
      expect(y).toBeGreaterThanOrEqual(70)
      expect(y).toBeLessThanOrEqual(430)
      expect(x).toBeGreaterThan(400)
    }
  })
  it('stays positive and nearly wordless: no warnings, no red, only the EMERALD wordmark', () => {
    for (const v of BANNER_ARTS) {
      const html = bannerArtHtml(v, F, W)
      expect(html).toContain('EMERALD')
      const body = html.replace(/<style>[\s\S]*?<\/style>/, '')
      expect(body).not.toMatch(/sign|warn|win--red|is-red|CA:/i)
      const words = body.replace(/<[^>]+>/g, ' ').match(/[A-Za-z]{2,}/g) ?? []
      expect(words).toEqual(['EMERALD'])
      expect(html).toContain('shape-rendering="crispEdges"')
    }
  })
  it('windows variant: six unlit windows and one lit with the gem', () => {
    const html = bannerArtHtml('windows', F, W)
    expect(html.match(/<li class="mw">/g)).toHaveLength(6)
    expect(html.match(/<li class="mw is-on">/g)).toHaveLength(1)
  })
})
