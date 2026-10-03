// Post-launch X cards: the dev burn, the share sent to the author of Snowmoon (both real, on-chain) and the dev token
// lock (no amount on purpose, team decision). Same Emerald.exe look as kit/templates.ts; nothing red.
// Facts for the burn: tx 0x6e34b8b1993f74f2678cc735ee3146b2427297396d4246fd4c4e8f4435cf3fd5 (2026-10-03 21:04:11 UTC),
// 55,000,000 EMERALD from the creator wallet to 0x…dEaD; total supply 1,000,000,000.
// Author share: tx 0x9f640bf6950ff982aaf3dbed74d3fde59b830baab04b191f7428913666c97415 (2026-10-03 21:07:23 UTC),
// 29,000,000 EMERALD from the creator wallet to 0xd8dA…6045.
// Usage: npx tsx kit/postlaunch.ts
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { BOOK_LEGAL, shortCa } from './cards.js'
import { CARD, CELL, esc, ICONS, page, taskbar, win, type KitFonts } from './templates.js'
import { wallpaperUri } from './wallpaper.js'

export const CA = '0xae4ee0f4f2f684917ca5fd4cb8a9918fff46b669'
export const CREATOR = '0xe13cfd095387FF8a8Bee3023baDAB2Ce5d19E181'
export const DEAD = '0x000000000000000000000000000000000000dEaD'
export const AUTHOR = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
export const BURN_TX = '0x6e34b8b1993f74f2678cc735ee3146b2427297396d4246fd4c4e8f4435cf3fd5'
export const AUTHOR_TX = '0x9f640bf6950ff982aaf3dbed74d3fde59b830baab04b191f7428913666c97415'
const TRAY = `CA: ${shortCa(CA)}`
const TASKS = ['Emerald.exe', 'Recycle Bin', 'Lock.exe', 'Snowmoon.txt']

const ICON_BIN = `<svg viewBox="0 0 48 48" shape-rendering="crispEdges"><path d="M10 12h28l-3 32H13z" fill="#d8d8e2" stroke="#2a283c" stroke-width="2"/><path d="M7 8h34v5H7z" fill="#b9b8c9" stroke="#2a283c" stroke-width="2"/><path d="M19 4h10v4H19z" fill="#b9b8c9" stroke="#2a283c" stroke-width="2"/><path d="M18 18v20M24 18v20M30 18v20" stroke="#8a8aa0" stroke-width="2"/></svg>`
const ICON_LOCK = `<svg viewBox="0 0 48 48" shape-rendering="crispEdges"><path d="M14 22v-7a10 10 0 0 1 20 0v7" fill="none" stroke="#2a283c" stroke-width="5"/><path d="M14 22v-7a10 10 0 0 1 20 0v7" fill="none" stroke="#b9b8c9" stroke-width="2.5"/><rect x="9" y="21" width="30" height="23" fill="#3ce68c" stroke="#0f5a33" stroke-width="2"/><path d="M22 29h4v8h-4z" fill="#0f5a33"/></svg>`

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** A wizard-like window: big icon panel on the left, the facts on the right (same frame as the "how" card). */
function factWin(o: { title: string; icon: 'gem' | 'doc' | 'calc'; art: string; chip: string; headline: string; rows: [string, string][]; foot: string; legal?: string }): string {
  return win({
    title: o.title,
    icon: o.icon,
    style: 'left:250px; top:40px; width:1300px; height:760px;',
    body: `<div class="wizard"><div class="art">${o.art}</div><div class="main"><p class="chip">${esc(o.chip)}</p><h1 class="h">${esc(o.headline).replace(/\d[\d,]*/g, (m) => `<span class="num">${m}</span>`)}</h1>
<table class="facts">${o.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
<p class="foot">${esc(o.foot)}</p>${o.legal ? `<p class="legal">${esc(o.legal)}</p>` : ''}</div></div>`,
  })
}

const CSS = `.wizard { display: grid; grid-template-columns: 300px 1fr; gap: 36px; flex: 1; }
.art { display: grid; place-items: center; background: linear-gradient(160deg, #3127b8, #6a5ff2); border: 3px solid; border-color: var(--face-lo) var(--face-hi) var(--face-hi) var(--face-lo); }
.art svg { width: 200px; height: 200px; filter: drop-shadow(10px 12px 0 rgb(20 12 70 / .4)); }
.main { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.h { font-size: 60px; }
.h .num { margin-right: 0; letter-spacing: -.03em; }
.facts { border-collapse: collapse; font: 500 25px/1.4 var(--mono); width: 100%; background: var(--paper); border: 3px solid; border-color: var(--face-lo) var(--face-hi) var(--face-hi) var(--face-lo); }
.facts th { text-align: left; font: 700 18px/1.3 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); width: 34%; padding: 14px 18px; border-bottom: 2px dashed #c9c8d6; }
.facts td { padding: 14px 18px; border-bottom: 2px dashed #c9c8d6; white-space: nowrap; }
.facts tr:last-child th, .facts tr:last-child td { border-bottom: 0; }
.foot { margin-top: auto; border-top: 3px solid var(--face-lo); padding-top: 16px; font-weight: 700; font-size: 25px; }`

export function burnCard(f: KitFonts, wall: string): string {
  const body = factWin({
    title: 'Recycle Bin',
    icon: 'calc',
    art: ICON_BIN,
    chip: 'Dev burn · October 3, 2026',
    headline: '55,000,000 $EMERALD burned.',
    rows: [
      ['Amount', '55,000,000 EMERALD'],
      ['Share of supply', '5.5 % of 1,000,000,000'],
      ['From', `dev wallet ${short(CREATOR)}`],
      ['To', `dead address ${short(DEAD)}`],
      ['Tx', short(BURN_TX)],
    ],
    foot: 'Sent to the dead address. Nobody can move it again.',
  })
  return page(f, CARD.w, CARD.h, wall, CSS, ICONS + body + taskbar(TASKS, 'Recycle Bin', TRAY))
}

export function lockCard(f: KitFonts, wall: string): string {
  const body = factWin({
    title: 'Lock.exe',
    icon: 'gem',
    art: ICON_LOCK,
    chip: 'Dev tokens · locked',
    headline: 'Dev tokens locked.',
    rows: [
      ['What', 'the dev wallet’s $EMERALD'],
      ['Owner', `dev wallet ${short(CREATOR)}`],
      ['Liquidity', 'locked forever by Stockereum'],
    ],
    foot: 'The dev tokens are locked on-chain.',
  })
  return page(f, CARD.w, CARD.h, wall, CSS, ICONS + body + taskbar(TASKS, 'Lock.exe', TRAY))
}

export function authorCard(f: KitFonts, wall: string): string {
  const amount = '29,000,000'
  const body = win({
    title: 'Snowmoon.txt',
    icon: 'doc',
    style: 'left:250px; top:40px; width:1300px; height:760px;',
    body: `<div class="sunk notepad"><p class="chip">For the author of Snowmoon</p><h1 class="h">A share for the author.</h1>
<div class="dv"><p>To: ${esc(short(AUTHOR))} (Vitalik Buterin)</p><p>Amount: ${esc(amount)} $EMERALD</p><p>Share of supply: 2.9 %</p><p>Tx: ${esc(short(AUTHOR_TX))}</p></div>
<p class="coda">Emerald comes from his novel, so part of the dev tokens went to him on October 3. It’s his to keep, sell or give away. He didn’t ask for it and isn’t involved.</p>
<p class="legal">${esc(BOOK_LEGAL)}</p></div>`,
  })
  const css = `.win__body { padding: 8px; }
.notepad { background: #fff; flex: 1; padding: 30px 36px; display: flex; flex-direction: column; gap: 24px; }
.notepad .legal { margin-top: auto; }`
  return page(f, CARD.w, CARD.h, wall, css, ICONS + body + taskbar(TASKS, 'Snowmoon.txt', TRAY))
}


if (process.argv[1]?.endsWith('postlaunch.ts')) {
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
  const jobs: [string, string][] = [
    ['card-burn.jpg', burnCard(fonts, wall)],
    ['card-lock.jpg', lockCard(fonts, wall)],
    ['card-author.jpg', authorCard(fonts, wall)],
  ]
  const browser = await chromium.launch()
  try {
    for (const [name, html] of jobs) {
      const p = await browser.newPage({ viewport: { width: CARD.w, height: CARD.h }, deviceScaleFactor: 1 })
      await p.setContent(html, { waitUntil: 'load' })
      await p.evaluate(async () => {
        await Promise.all(['700 64px "Pixelify Sans"', '500 26px "IBM Plex Mono"', '700 26px "IBM Plex Mono"'].map((x) => document.fonts.load(x)))
      })
      const overflow = await p.evaluate(() =>
        [...document.querySelectorAll('.win, .main > *, .sunk > *')]
          .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 4)
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
