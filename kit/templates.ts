// HTML for the X kit, in the Emerald.exe look (web/index.html + web/src/exe/exe.css): a dithered violet desktop,
// bevelled windows with a violet title bar, the pixel gem, Pixelify Sans + IBM Plex Mono. Every letter is real type.
import { GEM_PALETTE, gemGrid, pixelSvg, silhouette, SPARKLE_GRID, SPARKLE_PALETTE } from './pixel.js'

export interface KitFonts {
  pixel: string // data: URI of PixelifySans-400-700.woff2
  mono: string // IBMPlexMono-Medium.woff2
  monoBold: string // IBMPlexMono-Bold.woff2
}

export interface Step {
  n: string
  title: string
  text: string
}

interface CardBase {
  id: string
  tray: string // taskbar tray: "CA: soon" or the short CA
}
export type CardSpec =
  | (CardBase & { kind: 'book'; chapter: string; headline: string; quote: string[]; coda: string; legal: string; verdict?: VerdictMini })
  | (CardBase & { kind: 'how'; headline: string; steps: Step[]; foot: string; legal: string })
  | (CardBase & { kind: 'lineup'; headline: string[]; sub: string; lit: string; ca: string; legal: string })
  | (CardBase & { kind: 'fees'; headline: string; rows: [string, string][]; total: [string, string]; quotas: string[]; note: string; ca: string })

export interface VerdictMini {
  status: string
  headline: string
  reasons: string[]
}

export interface BannerSpec {
  headline: string[]
  tagline: string
  tray: string
  verdict: VerdictMini
}

export const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Escaped headline with percentages set in mono: Pixelify's "2" reads as an "8" at display sizes. */
export const hl = (s: string): string => esc(s).replace(/\d+ ?%/g, (m) => `<span class="num">${m}</span>`)

/** CSS px per wallpaper pixel, as on the site (wallpaper.ts CELL) but a bit coarser for the larger kit images. */
export const CELL = 4

function base(f: KitFonts, w: number, h: number, wallUri: string): string {
  return `
@font-face { font-family: "Pixelify Sans"; src: url(${f.pixel}) format("woff2"); font-weight: 400 700; }
@font-face { font-family: "IBM Plex Mono"; src: url(${f.mono}) format("woff2"); font-weight: 500; }
@font-face { font-family: "IBM Plex Mono"; src: url(${f.monoBold}) format("woff2"); font-weight: 700; }
:root { --face:#d6d5e2; --face-hi:#ffffff; --face-lo:#8d8ba3; --face-dk:#2a283c; --paper:#fbfbfd; --ink:#1d1b33; --ink-2:#4a4862;
  --red:#c4161c; --gem:#3ce68c; --bar:#4338ca; --bar-a:#3127b8; --bar-b:#6a5ff2;
  --pixel:"Pixelify Sans", monospace; --mono:"IBM Plex Mono", monospace; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
body { position: relative; font: 500 26px/1.5 var(--mono); color: var(--ink); -webkit-font-smoothing: antialiased; font-variant-ligatures: none;
  background: #667eea url(${wallUri}) 0 0 / ${w}px ${h}px no-repeat; image-rendering: pixelated; }
/* faint CRT glass, as on the site */
.crt { position: absolute; inset: 0; z-index: 50; pointer-events: none;
  background: radial-gradient(ellipse 120% 100% at 50% 50%, transparent 60%, rgb(14 8 52 / .26) 100%),
    repeating-linear-gradient(to bottom, rgb(18 10 64 / .05) 0 1px, transparent 1px 3px); }
.abs { position: absolute; }
/* windows */
.win { position: absolute; background: var(--face); border: 3px solid; border-color: var(--face-hi) var(--face-dk) var(--face-dk) var(--face-hi);
  box-shadow: inset -3px -3px 0 var(--face-lo), inset 3px 3px 0 #ecebf3, 9px 12px 0 rgb(34 24 110 / .32), 0 44px 80px -20px rgb(18 10 78 / .6);
  padding: 6px; display: flex; flex-direction: column; }
.win__bar { position: relative; display: flex; align-items: center; gap: 14px; color: #fff; padding: 8px 8px 8px 14px; min-height: 60px; overflow: hidden;
  background: linear-gradient(90deg, var(--bar-a), var(--bar-b)); text-shadow: 2px 2px 0 rgb(20 12 70 / .35); }
.win__bar::before { content: ""; position: absolute; inset: 0 0 50% 0; background: linear-gradient(rgb(255 255 255 / .24), rgb(255 255 255 / .04)); }
.win--red .win__bar { --bar-a: #8c0e14; --bar-b: #e0383e; }
.win__ico { position: relative; width: 32px; height: 32px; flex: none; }
.win__title { position: relative; font: 600 30px/1.1 var(--pixel); letter-spacing: .015em; flex: 1; white-space: nowrap; }
.win__btns { position: relative; display: flex; gap: 6px; }
.win__btn { width: 44px; height: 40px; display: grid; place-items: center; font: 700 26px/1 var(--pixel); color: var(--ink); text-shadow: none;
  background: linear-gradient(#ecebf3, var(--face)); border: 3px solid; border-color: var(--face-hi) var(--face-dk) var(--face-dk) var(--face-hi); }
.win__body { padding: 30px 34px; flex: 1; display: flex; flex-direction: column; gap: 22px; }
.sunk { background: var(--paper); border: 3px solid; border-color: var(--face-lo) var(--face-hi) var(--face-hi) var(--face-lo); box-shadow: inset 2px 2px 0 var(--face-dk); }
.h { font: 700 64px/1.12 var(--pixel); color: var(--ink); letter-spacing: -.005em; text-wrap: balance; }
.h .num { font-family: var(--mono); letter-spacing: -.06em; margin-right: .32em; }
.chip { align-self: flex-start; font: 700 19px/1.3 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: #fff; background: var(--bar-a); padding: 4px 12px; }
.legal { font: 500 19px/1.45 var(--mono); color: var(--ink-2); }
.coda { font: 700 26px/1.45 var(--mono); }
/* the book's device view: dark, as in the novel */
.dv { background: #0a0e27; border: 2px solid #3d70c3; padding: 22px 26px; display: grid; gap: 10px; font: 500 27px/1.45 var(--mono); color: #b8d8ff; }
.dv p::before { content: "> "; color: #3d70c3; }
/* desktop icons */
.icons { position: absolute; left: 34px; top: 40px; display: grid; gap: 34px; justify-items: center; width: 150px; }
.icon { display: grid; justify-items: center; gap: 8px; }
.icon svg { width: 64px; height: 64px; filter: drop-shadow(3px 4px 0 rgb(34 24 110 / .35)); }
.icon span { font: 600 19px/1.2 var(--pixel); color: #fff; background: rgb(32 24 104 / .72); padding: 2px 7px; white-space: nowrap; }
/* taskbar */
.taskbar { position: absolute; left: 0; right: 0; bottom: 0; height: 64px; display: flex; align-items: center; gap: 10px; padding: 7px 10px; z-index: 40;
  background: linear-gradient(#e4e3ee, var(--face) 30%); border-top: 3px solid var(--face-hi); box-shadow: 0 -1px 0 var(--face-lo), 0 -10px 30px rgb(34 24 110 / .22); }
.btn { display: inline-flex; align-items: center; gap: 10px; height: 48px; padding: 0 16px; font: 700 23px/1 var(--pixel); color: var(--ink); white-space: nowrap;
  background: linear-gradient(#ecebf3, var(--face)); border: 3px solid; border-color: var(--face-hi) var(--face-dk) var(--face-dk) var(--face-hi); box-shadow: inset -2px -2px 0 var(--face-lo); }
.btn svg { width: 28px; height: 28px; }
.btn.is-on { border-color: var(--face-dk) var(--face-hi) var(--face-hi) var(--face-dk); box-shadow: inset 2px 2px 0 var(--face-lo);
  background: repeating-conic-gradient(#f1f0f7 0 25%, #dddcea 0 50%) 0 0 / 4px 4px; }
.task { font-weight: 600; font-size: 20px; }
.tray { margin-left: auto; display: flex; align-items: center; gap: 12px; height: 48px; padding: 0 16px; font: 700 21px/1 var(--mono); color: var(--ink);
  border: 3px solid; border-color: var(--face-lo) var(--face-hi) var(--face-hi) var(--face-lo); white-space: nowrap; }
.tray .led { width: 12px; height: 12px; background: var(--gem); box-shadow: 0 0 0 2px #0f5a33; }
/* verdict panel (the checker's screen) */
.screen { padding: 22px 26px; display: grid; gap: 10px; }
.screen.is-red { box-shadow: inset 2px 2px 0 var(--face-dk), 0 0 0 4px var(--red), 0 0 34px rgb(196 22 28 / .3); }
.status { display: flex; align-items: center; gap: 10px; font: 700 17px/1 var(--mono); letter-spacing: .08em; color: var(--ink-2); text-transform: uppercase; }
.status i { width: 12px; height: 12px; background: var(--gem); box-shadow: 0 0 0 1px #0f5a33; }
.verdict { display: flex; align-items: center; gap: 18px; font: 700 66px/1.05 var(--pixel); color: var(--red); }
.verdict svg { width: 86px; height: 76px; flex: none; }
.reasons { list-style: none; display: grid; gap: 8px; font: 500 21px/1.45 var(--mono); }
.reasons li { position: relative; padding-left: 24px; }
.reasons li::before { content: ""; position: absolute; left: 0; top: .5em; width: 12px; height: 12px; background: var(--red); }
`
}

const ICON_DOC = `<svg viewBox="0 0 48 48"><path d="M10 4h20l9 9v31H10z" fill="#f4f4f8" stroke="#3b3a4a" stroke-width="2"/><path d="M30 4v9h9" fill="#d8d8e2" stroke="#3b3a4a" stroke-width="2"/><path d="M15 20h18M15 25h18M15 30h18M15 35h12" stroke="#8a8aa0" stroke-width="2"/></svg>`
const ICON_WALLET = `<svg viewBox="0 0 48 48"><path d="M20 14l8-10 8 10z" fill="#3ce68c" stroke="#1d6b44" stroke-width="1.5"/><rect x="5" y="13" width="36" height="28" rx="5" fill="#7a5fd6" stroke="#2c2370" stroke-width="2"/><rect x="30" y="22" width="13" height="10" rx="3" fill="#5b45b8" stroke="#2c2370" stroke-width="2"/><circle cx="35" cy="27" r="2" fill="#e6e3fb"/></svg>`
const ICON_CALC = `<svg viewBox="0 0 20 20"><rect x="3" y="1" width="14" height="18" fill="#e6e5ef" stroke="#2a283c" stroke-width="1.4"/><rect x="5" y="3" width="10" height="4" fill="#b6c7a3"/><path d="M5 10h2v2H5zm4 0h2v2H9zm4 0h2v2h-2zM5 14h2v2H5zm4 0h2v2H9zm4 0h2v2h-2z" fill="#4a4862"/></svg>`
const ICON_WARN = `<svg viewBox="0 0 100 88"><path d="M50 4 96 84H4z" fill="#fff" stroke="#c4161c" stroke-width="9" stroke-linejoin="round"/><rect x="44" y="30" width="12" height="30" fill="#1d1b33"/><rect x="44" y="66" width="12" height="10" fill="#1d1b33"/></svg>`
const ICON_MOON_PC = `<svg viewBox="0 0 48 48"><rect x="5" y="8" width="38" height="26" rx="2" fill="#0f0c29" stroke="#3b3a4a" stroke-width="2"/><path d="M9 12h30v18H9z" fill="#302b63"/><circle cx="33" cy="17" r="3" fill="#eef0fa"/><path d="M17 40h14M24 34v6" stroke="#3b3a4a" stroke-width="3"/></svg>`

const sparkle = (px: number): string => pixelSvg(SPARKLE_GRID, SPARKLE_PALETTE, px)

/** The gem as crisp pixel art, `px` CSS px per gem pixel. */
export const gem = (px: number, cls = ''): string => pixelSvg(gemGrid(), GEM_PALETTE, px, cls)

type Icon = 'gem' | 'doc' | 'calc'
const winIcon = (i: Icon) => (i === 'gem' ? gem(2, 'win__ico') : (i === 'doc' ? ICON_DOC : ICON_CALC).replace('<svg ', '<svg class="win__ico" '))

export function win(o: { title: string; icon: Icon; body: string; style: string; red?: boolean }): string {
  return `<section class="win${o.red ? ' win--red' : ''}" style="${o.style}">
<div class="win__bar">${winIcon(o.icon)}<h2 class="win__title">${esc(o.title)}</h2><span class="win__btns"><span class="win__btn">_</span><span class="win__btn">×</span></span></div>
<div class="win__body">${o.body}</div></section>`
}

export function taskbar(tasks: string[], active: string, tray: string): string {
  const items = tasks.map((t) => `<span class="btn task${t === active ? ' is-on' : ''}">${esc(t)}</span>`).join('')
  return `<footer class="taskbar"><span class="btn">${gem(1.75)}Start</span>${items}<span class="tray"><i class="led"></i>${esc(tray)}</span></footer>`
}

const ICONS = `<nav class="icons">
<div class="icon">${gem(4)}<span>Emerald.exe</span></div>
<div class="icon">${ICON_DOC}<span>Snowmoon.txt</span></div>
<div class="icon">${ICON_WALLET}<span>Wallet</span></div>
<div class="icon">${ICON_MOON_PC}<span>Classic view</span></div>
</nav>`

function verdictPanel(v: VerdictMini): string {
  return `<div class="sunk screen is-red"><p class="status"><i></i>${esc(v.status)}</p>
<p class="verdict">${ICON_WARN}${esc(v.headline)}</p>
<ul class="reasons">${v.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`
}

function page(f: KitFonts, w: number, h: number, wallUri: string, css: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base(f, w, h, wallUri)}${css}</style></head><body>${body}<div class="crt"></div></body></html>`
}

const TASKS = ['Emerald.exe', 'Snowmoon.txt', 'How a check works', 'Token']

/** Card size for X (16:9). */
export const CARD = { w: 1600, h: 900 }

export function cardHtml(s: CardSpec, f: KitFonts, wallUri: string): string {
  const { w, h } = CARD
  let css = ''
  let body = ''
  let active = 'Emerald.exe'
  if (s.kind === 'book') {
    active = 'Snowmoon.txt'
    const left = s.verdict ? 220 : 250
    const width = s.verdict ? 790 : 1090
    body += win({
      title: 'Snowmoon.txt',
      icon: 'doc',
      style: `left:${left}px; top:40px; width:${width}px; height:760px;`,
      body: `<div class="sunk notepad"><p class="chip">${esc(s.chapter)}</p><h1 class="h">${esc(s.headline)}</h1>
<div class="dv">${s.quote.map((q) => `<p>${esc(q)}</p>`).join('')}</div>
<p class="coda">${esc(s.coda)}</p><p class="legal">${esc(s.legal)}</p></div>`,
    })
    if (s.verdict) {
      body += win({ title: 'Emerald.exe', icon: 'gem', red: true, style: 'left:985px; top:250px; width:580px;', body: verdictPanel(s.verdict) })
      css += `.win--red .verdict { font-size: 54px; } .win--red .verdict svg { width: 70px; height: 62px; } .win--red .win__body { padding: 22px; }`
    }
    css += `.notepad { background: #fff; flex: 1; padding: 30px 34px; display: flex; flex-direction: column; gap: 24px; } .notepad .legal { margin-top: auto; } .win__body { padding: 8px; }`
  } else if (s.kind === 'how') {
    active = 'How a check works'
    body += win({
      title: 'How a check works',
      icon: 'gem',
      style: 'left:250px; top:40px; width:1300px; height:760px;',
      body: `<div class="wizard"><div class="art">${gem(14)}</div><div class="main"><h1 class="h">${esc(s.headline)}</h1>
<ol class="steps">${s.steps.map((st) => `<li><span class="n">${esc(st.n)}</span><div><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p></div></li>`).join('')}</ol>
<p class="foot">${esc(s.foot)}</p><p class="legal">${esc(s.legal)}</p></div></div>`,
    })
    css += `.wizard { display: grid; grid-template-columns: 300px 1fr; gap: 36px; flex: 1; }
.art { display: grid; place-items: center; background: linear-gradient(160deg, #3127b8, #6a5ff2); border: 3px solid; border-color: var(--face-lo) var(--face-hi) var(--face-hi) var(--face-lo); }
.art svg { filter: drop-shadow(10px 12px 0 rgb(20 12 70 / .4)); }
.main { display: flex; flex-direction: column; gap: 24px; }
.steps { list-style: none; display: grid; gap: 22px; }
.steps li { display: grid; grid-template-columns: 70px 1fr; gap: 20px; align-items: start; }
.n { display: grid; place-items: center; height: 62px; font: 700 30px/1 var(--mono); color: #fff; background: var(--bar); border: 3px solid; border-color: #8e88f0 #1f1a70 #1f1a70 #8e88f0; }
.steps h3 { font: 700 32px/1.2 var(--pixel); margin-bottom: 4px; }
.steps p { font-size: 24px; line-height: 1.45; }
.foot { margin-top: auto; border-top: 3px solid var(--face-lo); padding-top: 16px; font-weight: 700; font-size: 25px; }`
  } else if (s.kind === 'lineup') {
    active = '7 $EMERALD.txt'
    const watches = Array.from({ length: 6 }, () => `<li class="watch"><span class="face">…</span></li>`).join('')
    body += win({
      title: '7 $EMERALD.txt',
      icon: 'doc',
      style: 'left:250px; top:40px; width:1300px; height:760px;',
      body: `<div class="sunk paper"><h1 class="h big">${s.headline.map(esc).join('<br>')}</h1><p class="sub">${esc(s.sub)}</p>
<ol class="watches">${watches}<li class="watch is-on"><span class="face"><i></i>${esc(s.lit)}</span></li></ol>
<p class="ca">${esc(s.ca)}</p><p class="legal">${esc(s.legal)}</p></div>`,
    })
    css += `.win__body { padding: 8px; }
.paper { flex: 1; padding: 30px 36px; display: flex; flex-direction: column; gap: 24px; }
.big { font-size: 84px; }
.sub { font-size: 26px; max-width: 1080px; }
.watches { list-style: none; display: grid; grid-template-columns: repeat(6, 1fr) 2.6fr; gap: 14px; align-items: center; }
.watch { position: relative; display: grid; place-items: center; padding: 16px 0; }
.watch::before { content: ""; position: absolute; inset: 0 30%; background: #764ba2; box-shadow: inset 3px 0 0 rgb(255 255 255 / .2), inset -3px 0 0 rgb(0 0 0 / .25); }
.face { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 1; background: #24243e; color: #b3aed0; font: 700 26px/1 var(--mono); border: 4px solid #4a4862; box-shadow: 3px 4px 0 rgb(34 24 110 / .3); }
.is-on .face { aspect-ratio: auto; min-height: 92px; display: flex; gap: 12px; padding: 0 14px; background: #0a0e27; color: #cceeff; font: 700 24px/1.2 var(--mono); border-color: #3d70c3; box-shadow: 0 0 0 4px var(--gem), 3px 4px 0 rgb(34 24 110 / .3); }
.is-on .face i { width: 14px; height: 14px; background: var(--gem); flex: none; }
.ca { font: 700 31px/1.2 var(--mono); background: #eeedf5; border: 3px solid; border-color: var(--face-lo) var(--face-hi) var(--face-hi) var(--face-lo); padding: 14px 18px; white-space: nowrap; }
.legal { margin-top: auto; }`
  } else {
    active = 'Token'
    body += win({
      title: 'Token',
      icon: 'calc',
      style: 'left:250px; top:40px; width:1300px; height:760px;',
      body: `<h1 class="h">${hl(s.headline)}</h1><div class="grid"><div class="receipt"><table><thead><tr><th colspan="2">Trade fee</th></tr></thead><tbody>
${s.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${esc(v)}</td></tr>`).join('')}
<tr class="total"><td>${esc(s.total[0])}</td><td class="num">${esc(s.total[1])}</td></tr></tbody></table></div>
<div class="side"><ul class="quotas">${s.quotas.map((q) => `<li>${esc(q)}</li>`).join('')}</ul><p class="note">${esc(s.note)}</p></div></div><p class="ca">${esc(s.ca)}</p>`,
    })
    css += `.grid { display: grid; grid-template-columns: 560px 1fr; gap: 40px; align-items: start; }
.receipt { background: #fff; padding: 22px 26px 38px; box-shadow: 3px 4px 0 rgb(34 24 110 / .25); border: 1px solid var(--face-lo);
  -webkit-mask: linear-gradient(#000 0 0) top / 100% calc(100% - 14px) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / 28px 14px repeat-x; }
.receipt table { width: 100%; border-collapse: collapse; font: 500 28px/1.5 var(--mono); }
.receipt th { text-align: left; font: 700 19px/1.3 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2); padding-bottom: 10px; border-bottom: 2px dashed var(--face-lo); }
.receipt td { padding: 12px 0; border-bottom: 2px dashed #c9c8d6; }
.receipt .num { text-align: right; white-space: nowrap; }
.receipt .total td { font-weight: 700; font-size: 32px; border-top: 5px double var(--ink); border-bottom: 0; }
.side { display: grid; gap: 30px; padding-top: 12px; }
.note { font-size: 24px; color: var(--ink-2); border-top: 3px solid var(--face-lo); padding-top: 18px; }
.quotas { list-style: none; display: grid; gap: 18px; font-size: 27px; }
.quotas li { display: flex; gap: 16px; align-items: baseline; }
.quotas li::before { content: ""; flex: none; width: 14px; height: 14px; background: var(--gem); box-shadow: 0 0 0 2px #0f5a33; }
.ca { margin-top: auto; font: 700 31px/1.2 var(--mono); background: #eeedf5; border: 3px solid; border-color: var(--face-lo) var(--face-hi) var(--face-hi) var(--face-lo); padding: 14px 18px; white-space: nowrap; }`
  }
  const tasks = s.kind === 'lineup' ? ['Emerald.exe', '7 $EMERALD.txt', 'Snowmoon.txt', 'Token'] : TASKS
  return page(f, w, h, wallUri, css, ICONS + body + taskbar(tasks, active, s.tray))
}

/** X header, 1500x500. The avatar covers the bottom left: the text sits top left, the window on the right. */
export function bannerHtml(s: BannerSpec, f: KitFonts, wallUri: string): string {
  const css = `
.hero { position: absolute; left: 64px; top: 44px; display: grid; gap: 18px; }
.hero h1 { --s: 3px; font: 700 78px/.98 var(--pixel); color: #fff; letter-spacing: -.01em;
  text-shadow: calc(var(--s) * -1) 0 #2c2680, var(--s) 0 #2c2680, 0 calc(var(--s) * -1) #2c2680, 0 var(--s) #2c2680,
    calc(var(--s) * 2) calc(var(--s) * 2) 0 #2c2680, calc(var(--s) * 3) calc(var(--s) * 3) 0 #2c2680, calc(var(--s) * 4) calc(var(--s) * 5) 0 rgb(20 10 80 / .3); }
.hero .chip { font-size: 20px; background: rgb(32 24 104 / .78); }
.spark { position: absolute; }
.win { padding: 5px; } .win__bar { min-height: 50px; } .win__title { font-size: 26px; } .win__btn { width: 38px; height: 34px; font-size: 22px; }
.win__body { padding: 14px; }
.screen { padding: 16px 20px; gap: 8px; } .verdict { font-size: 50px; } .verdict svg { width: 62px; height: 54px; }
.reasons { font-size: 17px; } .status { font-size: 14px; }
.taskbar { height: 52px; padding: 5px 8px; } .btn { height: 40px; font-size: 20px; } .tray { height: 40px; font-size: 19px; }`
  const body = `<div class="hero"><h1>${s.headline.map(esc).join('<br>')}</h1><p class="chip">${esc(s.tagline)}</p></div>
<div class="spark" style="left:820px; top:62px">${sparkle(4)}</div>
${win({ title: 'Emerald.exe', icon: 'gem', red: true, style: 'left:870px; top:112px; width:480px;', body: verdictPanel(s.verdict) })}
${taskbar(['Emerald.exe', 'Snowmoon.txt'], 'Emerald.exe', s.tray)}`
  return page(f, 1500, 500, wallUri, css, body)
}

/** Profile picture, 1000x1000: the pixel gem alone on the desktop, readable at 48 px and inside X's circle crop. */
export function pfpHtml(f: KitFonts, wallUri: string): string {
  const px = 38
  const shadow = pixelSvg(silhouette(gemGrid()), { X: 'rgb(24 16 92 / .5)' }, px)
  const css = `
.stack { position: absolute; left: 50%; top: 50%; width: ${16 * px}px; height: ${16 * px}px; translate: -50% -50%; }
.stack svg { position: absolute; left: 0; top: 0; }
.shadow { translate: ${px}px ${Math.round(px * 1.3)}px; }
.spark { position: absolute; right: 140px; top: 150px; }
.crt { background: radial-gradient(circle at 50% 50%, transparent 52%, rgb(14 8 52 / .3) 100%), repeating-linear-gradient(to bottom, rgb(18 10 64 / .05) 0 1px, transparent 1px 3px); }`
  const body = `<div class="stack"><div class="shadow">${shadow}</div>${gem(px)}</div><div class="spark">${sparkle(12)}</div>`
  return page(f, 1000, 1000, wallUri, css, body)
}

// ---------------------------------------------------------------------------------------------------------------
// Banner art (v2): image first, almost no words. Three variants, all 1500x500. X covers the bottom left (~400x200)
// with the avatar and crops to the middle 1500x360 on some screens, so everything that matters sits in that band.

export type BannerArt = 'gem' | 'windows' | 'mosaic'
export const BANNER_ARTS: readonly BannerArt[] = ['gem', 'windows', 'mosaic']

/** Where each variant puts its emerald light and which shader instant it uses (CSS px; the renderer divides by CELL). */
export const BANNER_ART: Record<BannerArt, { t: number; halo: { x: number; y: number; r: number; peak: number }; lift?: number }> = {
  gem: { t: 12, halo: { x: 1010, y: 250, r: 270, peak: 0.85 } },
  windows: { t: 26, halo: { x: 1218, y: 246, r: 200, peak: 0.8 } },
  mosaic: { t: 40, halo: { x: 1060, y: 236, r: 190, peak: 0.85 }, lift: -0.04 },
}

/** The gem recolored in desk violets: the unlit gems of the mosaic. */
const DIM_GEM: Record<string, string> = {
  K: '#4b4cbf', H: '#9aa6f5', T: '#8a98f2', G: '#7a8bef', S: '#6a7be6', D: '#5d68d6', L: '#7d8ff0', W: '#b5bdf8',
}

/** "EMERALD" in Pixelify with a hard pixel outline and a stepped drop shadow (no blur). */
const WORDMARK_CSS = `
.word { position: absolute; --s: 4px; font: 700 var(--size, 104px)/1 var(--pixel); color: #fff; letter-spacing: .02em; white-space: nowrap;
  text-shadow: calc(var(--s) * -1) 0 #2c2680, var(--s) 0 #2c2680, 0 calc(var(--s) * -1) #2c2680, 0 var(--s) #2c2680,
    calc(var(--s) * -1) calc(var(--s) * -1) #2c2680, var(--s) calc(var(--s) * -1) #2c2680, calc(var(--s) * -1) var(--s) #2c2680, var(--s) var(--s) #2c2680,
    calc(var(--s) * 2) calc(var(--s) * 2) 0 #2c2680, calc(var(--s) * 3) calc(var(--s) * 3) 0 #2c2680, calc(var(--s) * 4) calc(var(--s) * 4) 0 rgb(20 10 80 / .35); }
.spark { position: absolute; }
.spark svg, .stack svg { display: block; }`

/** A gem with its hard shadow, centered on (cx, cy). */
function gemStack(px: number, cx: number, cy: number, shadowAlpha = 0.45): string {
  const size = 16 * px
  const shadow = pixelSvg(silhouette(gemGrid()), { X: `rgb(24 16 92 / ${shadowAlpha})` }, px)
  return `<div class="stack" style="position:absolute; left:${cx - size / 2}px; top:${cy - size / 2}px; width:${size}px; height:${size}px">
<div style="position:absolute; left:${Math.round(px * 0.8)}px; top:${Math.round(px * 1.1)}px">${shadow}</div><div style="position:absolute; left:0; top:0">${gem(px)}</div></div>`
}

const spark = (px: number, x: number, y: number): string => `<div class="spark" style="left:${x}px; top:${y}px">${sparkle(px)}</div>`

export function bannerArtHtml(v: BannerArt, f: KitFonts, wallUri: string): string {
  let css = WORDMARK_CSS
  let body = ''
  if (v === 'gem') {
    const { x, y } = BANNER_ART.gem.halo
    body += `<h1 class="word" style="left:150px; top:${y - 62}px">EMERALD</h1>`
    body += gemStack(21, x, y)
    body += spark(7, x + 150, y - 178) + spark(4, x - 214, y + 58) + spark(3, x + 210, y + 104) + spark(3, x - 120, y - 170)
  } else if (v === 'windows') {
    const off = Array.from({ length: 6 }, () => `<li class="mw"><b></b><i>…</i></li>`).join('')
    body += `<ol class="row">${off}<li class="mw is-on"><b>EMERALD</b><i>${gem(7)}</i></li></ol>`
    const { x, y } = BANNER_ART.windows.halo
    body += spark(5, x + 92, y - 168) + spark(3, x - 132, y - 128) + spark(3, x + 118, y + 106)
    css += `
.row { position: absolute; left: 0; right: 0; top: ${y}px; translate: 0 -50%; list-style: none; display: flex; gap: 26px; justify-content: center; align-items: center; }
.mw { width: 128px; display: flex; flex-direction: column; padding: 4px; background: var(--face); border: 3px solid;
  border-color: var(--face-hi) var(--face-dk) var(--face-dk) var(--face-hi);
  box-shadow: inset -2px -2px 0 var(--face-lo), inset 2px 2px 0 #ecebf3, 7px 9px 0 rgb(34 24 110 / .32); }
.mw b { display: block; height: 24px; background: linear-gradient(90deg, #5650a8, #8f8ad0); font: 700 17px/24px var(--pixel); color: #fff;
  letter-spacing: .06em; padding-left: 8px; text-shadow: 2px 2px 0 rgb(20 12 70 / .4); }
.mw i { display: grid; place-items: center; height: 116px; margin-top: 4px; font: 700 34px/1 var(--mono); font-style: normal; color: #4f4c78;
  background: #24243e; border: 3px solid; border-color: var(--face-lo) var(--face-hi) var(--face-hi) var(--face-lo); }
.mw.is-on { width: 170px; margin-left: 12px; box-shadow: inset -2px -2px 0 var(--face-lo), inset 2px 2px 0 #ecebf3, 0 0 0 4px var(--gem), 0 0 0 8px #0f5a33, 9px 12px 0 8px rgb(34 24 110 / .3); }
.mw.is-on b { height: 30px; line-height: 30px; font-size: 19px; background: linear-gradient(90deg, var(--bar-a), var(--bar-b)); }
.mw.is-on i { height: 158px; background: #0a0e27; }`
  } else {
    const { x: lx, y: ly } = BANNER_ART.mosaic.halo
    const dim = pixelSvg(gemGrid(), DIM_GEM, 2)
    const cells: string[] = []
    for (let r = 0, y = 14; y < 500; r++, y += 72)
      for (let x = r % 2 ? 2 : 46; x < 1500; x += 88) {
        if (Math.hypot((x + 16 - lx) / 1.3, y + 16 - ly) < 128) continue // room for the lit gem
        cells.push(`<div class="dim" style="left:${x}px; top:${y}px">${dim}</div>`)
      }
    body += cells.join('')
    body += gemStack(9, lx, ly - 18, 0.5)
    body += `<p class="label" style="left:${lx}px; top:${ly + 70}px">EMERALD</p>`
    body += spark(5, lx + 68, ly - 124) + spark(3, lx - 112, ly - 34)
    css += `
.dim { position: absolute; }
.dim svg { display: block; filter: drop-shadow(2px 2px 0 rgb(34 24 110 / .22)); }
.label { position: absolute; translate: -50% 0; font: 700 26px/1 var(--pixel); color: #fff; letter-spacing: .08em; padding: 5px 10px 6px;
  background: #3127b8; box-shadow: 0 0 0 3px #1f1a70, 4px 5px 0 3px rgb(34 24 110 / .35); text-shadow: 2px 2px 0 rgb(20 12 70 / .45); }`
  }
  return page(f, 1500, 500, wallUri, css, body)
}
