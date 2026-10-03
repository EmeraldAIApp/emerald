// Pre-launch X cards, batch 2 (2026-10-03): green verdicts, what you can paste, lookalike addresses. Same Emerald.exe
// look as kit/templates.ts. Nothing red and no warning stamps on these cards (team rule for the pre-launch posts).
// Facts: engine/test/fixtures/cases/{swap-uniswap-universal-router-txhash,approve-exact-usdc-to-permit2,
// poisoning-wbtc-68m-flagged-lookalike}.json.
// Usage: npx tsx kit/prelaunch.ts      (writes kit/out/card-green.jpg, card-paste.jpg, card-lookalike.jpg)
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { CARD, CELL, esc, ICON_WALLET, ICONS, page, taskbar, TASKS, win, type KitFonts } from './templates.js'
import { wallpaperUri } from './wallpaper.js'

const TRAY = 'CA: soon'
const ICON_OK = `<svg viewBox="0 0 100 88"><circle cx="50" cy="44" r="38" fill="#3ce68c" stroke="#11713f" stroke-width="7"/><path d="M30 45l13 13 27-28" fill="none" stroke="#1d1b33" stroke-width="10"/></svg>`
const ICON_HASH = `<svg viewBox="0 0 48 48"><rect x="5" y="7" width="38" height="34" fill="#0a0e27" stroke="#3b3a4a" stroke-width="2"/><path d="M12 18h24M12 26h18M12 34h10" stroke="#7fbcff" stroke-width="3"/></svg>`
const ICON_SIG = `<svg viewBox="0 0 48 48"><path d="M10 4h20l9 9v31H10z" fill="#f4f4f8" stroke="#3b3a4a" stroke-width="2"/><path d="M15 20h18M15 25h12" stroke="#8a8aa0" stroke-width="2"/><path d="M14 37c4-6 6-6 7-2s3 3 6-2 4-1 7 1" fill="none" stroke="#4338ca" stroke-width="2.5"/></svg>`
const ICON_COIN = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="#ffd36b" stroke="#6b4a00" stroke-width="2.5"/><circle cx="24" cy="24" r="12" fill="none" stroke="#c98a1c" stroke-width="2"/><path d="M24 15l6 9-6 4-6-4zM18 26l6 8 6-8-6 4z" fill="#4338ca"/></svg>`

interface GreenPanel {
  status: string
  reasons: string[]
}

function greenWin(p: GreenPanel, style: string): string {
  return win({
    title: 'Emerald.exe',
    icon: 'gem',
    style,
    body: `<div class="sunk screen is-green"><p class="status"><i></i>${esc(p.status)}</p>
<p class="verdict">${ICON_OK}Looks fine.</p>
<ul class="reasons">${p.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`,
  }).replace('class="win"', 'class="win win--green"')
}

const GREEN_CSS = `
.win--green .win__bar { --bar-a: #0b5a31; --bar-b: #23a862; }
.win--green .win__body { padding: 20px; }
.screen.is-green { box-shadow: inset 2px 2px 0 var(--face-dk), 0 0 0 4px var(--gem), 0 0 34px rgb(60 230 140 / .3); }
.is-green .verdict { color: #11713f; font-size: 60px; }
.is-green .verdict svg { width: 70px; height: 62px; }
.is-green .reasons { font-size: 23px; }
.is-green .reasons li::before { background: var(--gem); box-shadow: 0 0 0 1px #11713f; }`

/** A notepad window with a chip, a headline and a closing line: the frame every card in this batch shares. */
function note(o: { title: string; chip: string; headline: string; body: string; foot: string; style: string }): string {
  return win({
    title: o.title,
    icon: 'doc',
    style: o.style,
    body: `<div class="sunk notepad"><p class="chip">${esc(o.chip)}</p><h1 class="h">${esc(o.headline)}</h1>${o.body}<p class="coda">${esc(o.foot)}</p></div>`,
  })
}

const NOTE_CSS = `.win__body { padding: 8px; }
.notepad { background: #fff; flex: 1; padding: 30px 36px; display: flex; flex-direction: column; gap: 26px; }
.notepad .coda { margin-top: auto; border-top: 3px solid var(--face-lo); padding-top: 18px; }`

export function greenCard(f: KitFonts, wall: string): string {
  const body =
    note({
      title: 'Green.txt',
      chip: 'Two real checks · Sept 2026',
      headline: 'Green means it looks fine.',
      body: `<p class="lede">Most of what you sign is normal. Emerald says that too, and shows why.</p>`,
      foot: 'Five checks, live Ethereum data.',
      style: 'left:220px; top:40px; width:560px; height:760px;',
    }) +
    greenWin(
      { status: 'Emerald · Uniswap swap', reasons: ['You send 550 USDC and get 2,441 FET back.', 'Uniswap’s router is verified. No scam reports.'] },
      'left:820px; top:40px; width:740px;',
    ) +
    greenWin(
      { status: 'Emerald · USDC approval', reasons: ['Approves exactly 650.39 USDC to Uniswap’s Permit2.', 'A set amount, not unlimited. Permit2 is verified.'] },
      'left:860px; top:430px; width:700px;',
    )
  const css = NOTE_CSS + GREEN_CSS + `.lede { font: 500 28px/1.5 var(--mono); }`
  return page(f, CARD.w, CARD.h, wall, css, ICONS + body + taskbar(TASKS, 'Emerald.exe', TRAY))
}

export function pasteCard(f: KitFonts, wall: string): string {
  const rows: [string, string, string][] = [
    [ICON_HASH, 'A transaction', 'The hash, or the raw call your wallet shows.'],
    [ICON_SIG, 'A signature request', 'Permit, Permit2, approvals: the text your wallet asks you to sign.'],
    [ICON_WALLET, 'An address', 'Before you send to it.'],
    [ICON_COIN, 'A token contract', 'Before you buy it.'],
  ]
  const body = note({
    title: 'What you can paste.txt',
    chip: 'Emerald · aiemerald.app',
    headline: 'Paste it before you sign it.',
    body: `<ul class="kinds">${rows.map(([i, t, d]) => `<li>${i}<div><h3>${esc(t)}</h3><p>${esc(d)}</p></div></li>`).join('')}</ul>`,
    foot: '5 free checks a day. No wallet, no sign-up.',
    style: 'left:250px; top:40px; width:1300px; height:760px;',
  })
  const css =
    NOTE_CSS +
    `.kinds { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 26px 40px; }
.kinds li { display: grid; grid-template-columns: 76px 1fr; gap: 20px; align-items: start; }
.kinds svg { width: 76px; height: 76px; filter: drop-shadow(3px 4px 0 rgb(34 24 110 / .25)); }
.kinds h3 { font: 700 34px/1.2 var(--pixel); margin-bottom: 6px; }
.kinds p { font-size: 24px; line-height: 1.45; color: var(--ink-2); }`
  return page(f, CARD.w, CARD.h, wall, css, ICONS + body + taskbar(TASKS, 'Emerald.exe', TRAY))
}

/** An address with its first and last 4 hex (after 0x) marked: the part people check by eye. */
const addr = (a: string): string =>
  `0x<b>${esc(a.slice(2, 6))}</b>${esc(a.slice(6, -4))}<b>${esc(a.slice(-4))}</b>`

export function lookalikeCard(f: KitFonts, wall: string): string {
  const real = '0xd9A1b0B1e1aE382DbDc898Ea68012FfcB2853a91'
  const fake = '0xd9A1C3788D81257612E2581A6ea0aDa244853a91'
  const body = note({
    title: 'Lookalikes.txt',
    chip: 'Address poisoning · May 3, 2024',
    headline: 'Same start. Same end. Different address.',
    body: `<div class="pair"><p class="lbl">The address they meant</p><p class="a">${addr(real)}</p>
<p class="lbl">The lookalike planted in their history</p><p class="a">${addr(fake)}</p></div>
<p class="story">That day, 1,155 WBTC (about $68M) went to the lookalike. Connect your wallet and Emerald compares each address with your own history and points out lookalikes.</p>`,
    foot: 'Check the middle, not just the ends.',
    style: 'left:250px; top:40px; width:1300px; height:760px;',
  })
  const css =
    NOTE_CSS +
    `.pair { display: grid; gap: 8px; background: #0a0e27; border: 2px solid #3d70c3; padding: 22px 28px; }
.lbl { font: 700 18px/1.3 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: #7fbcff; }
.lbl + .a { margin-bottom: 10px; }
.a { font: 500 37px/1.3 var(--mono); color: #b8d8ff; letter-spacing: .01em; white-space: nowrap; }
.a b { color: #0a0e27; background: var(--gem); font-weight: 700; padding: 0 2px; }
.story { font-size: 24px; line-height: 1.45; }
.notepad .h { font-size: 58px; }
.notepad { gap: 22px; }`
  return page(f, CARD.w, CARD.h, wall, css, ICONS + body + taskbar(TASKS, 'Emerald.exe', TRAY))
}

if (process.argv[1]?.endsWith('prelaunch.ts')) {
  const FONTS = 'web/public/fonts'
  const OUT = 'kit/out'
  mkdirSync(OUT, { recursive: true })
  const dataUri = (file: string, type: string) => `data:${type};base64,${readFileSync(file).toString('base64')}`
  const fonts: KitFonts = {
    pixel: dataUri(join(FONTS, 'PixelifySans-400-700.woff2'), 'font/woff2'),
    mono: dataUri(join(FONTS, 'IBMPlexMono-Medium.woff2'), 'font/woff2'),
    monoBold: dataUri(join(FONTS, 'IBMPlexMono-Bold.woff2'), 'font/woff2'),
  }
  const cell = (n: number) => Math.round(n / CELL)
  const wall = wallpaperUri({ w: cell(CARD.w), h: cell(CARD.h), t: 22, moon: { x: cell(1470), y: cell(110), r: cell(52) } })
  const browser = await chromium.launch()
  try {
    for (const [name, html] of [
      ['card-green.jpg', greenCard(fonts, wall)],
      ['card-paste.jpg', pasteCard(fonts, wall)],
      ['card-lookalike.jpg', lookalikeCard(fonts, wall)],
    ] as const) {
      const p = await browser.newPage({ viewport: { width: CARD.w, height: CARD.h }, deviceScaleFactor: 1 })
      await p.setContent(html, { waitUntil: 'load' })
      await p.evaluate(async () => {
        await Promise.all(['700 64px "Pixelify Sans"', '500 26px "IBM Plex Mono"', '700 26px "IBM Plex Mono"'].map((x) => document.fonts.load(x)))
      })
      const overflow = await p.evaluate(() =>
        [...document.querySelectorAll('.win, .win__body > *, .sunk > *')]
          .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
          .map((e) => `${e.tagName.toLowerCase()}.${e.className}`),
      )
      if (overflow.length) console.warn(`  overflow in ${name}: ${overflow.join(', ')}`)
      await p.screenshot({ path: join(OUT, name), type: 'jpeg', quality: 92 })
      await p.close()
      console.log(join(OUT, name))
    }
  } finally {
    await browser.close()
  }
}
