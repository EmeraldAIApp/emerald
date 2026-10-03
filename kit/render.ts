// Renders the X kit images (Emerald.exe look) into kit/out/ with Playwright: wallpaper painted in Node, fonts embedded.
// Usage: npx tsx kit/render.ts [--ca 0x…]      (without --ca: PFP, banner "CA: soon" and the pre-launch cards)
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium, type Browser } from 'playwright'
import { banner, cards } from './cards.js'
import { bannerHtml, CARD, cardHtml, CELL, pfpHtml, type KitFonts } from './templates.js'
import { wallpaperUri } from './wallpaper.js'

const { values } = parseArgs({ options: { ca: { type: 'string' } } })
const ca = values.ca && /^0x[0-9a-fA-F]{40}$/.test(values.ca) ? values.ca : null
if (values.ca && !ca) throw new Error(`--ca is not an address: ${values.ca}`)

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

async function shot(browser: Browser, html: string, w: number, h: number, out: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load' })
  const missing = await page.evaluate(async () => {
    const wanted = ['700 64px "Pixelify Sans"', '500 26px "IBM Plex Mono"', '700 26px "IBM Plex Mono"']
    await Promise.all(wanted.map((f) => document.fonts.load(f)))
    return wanted.filter((f) => !document.fonts.check(f))
  })
  if (missing.length) throw new Error(`fonts not loaded in ${out}: ${missing.join(', ')}`)
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('.win, .win__body > *, .sunk > *, .main > *, .paper > *')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
      .map((e) => `${e.tagName.toLowerCase()}.${e.className}`),
  )
  if (overflow.length) console.warn(`  overflow in ${out}: ${overflow.join(', ')}`)
  await page.screenshot({ path: out, type: out.endsWith('.png') ? 'png' : 'jpeg', ...(out.endsWith('.png') ? {} : { quality: 92 }) })
  await page.close()
  console.log(`${out}  ${w}x${h}`)
}

const browser = await chromium.launch()
try {
  // PFP: the pixel gem on the desktop, with a soft light behind it
  const pfpWall = wallpaperUri({ w: cell(1000), h: cell(1000), t: 31, glow: { x: cell(500), y: cell(500), r: cell(420) }, lift: -0.05 })
  await shot(browser, pfpHtml(fonts, pfpWall), 1000, 1000, join(OUT, 'pfp-1000.png'))
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', join(OUT, 'pfp-1000.png'), '-vf', 'scale=400:400:flags=lanczos', '-q:v', '2', join(OUT, 'pfp-400.jpg')])
  console.log(`${join(OUT, 'pfp-400.jpg')}  400x400`)

  const bannerWall = wallpaperUri({
    w: cell(1500),
    h: cell(500),
    t: 12,
    moon: { x: cell(1420), y: cell(78), r: cell(40) },
    glow: { x: cell(1110), y: cell(260), r: cell(260) },
  })
  await shot(browser, bannerHtml(banner(ca), fonts, bannerWall), 1500, 500, join(OUT, ca ? 'banner-live-1500x500.jpg' : 'banner-soon-1500x500.jpg'))

  const cardWall = wallpaperUri({ w: cell(CARD.w), h: cell(CARD.h), t: 22, moon: { x: cell(1470), y: cell(110), r: cell(52) } })
  for (const c of cards(ca)) await shot(browser, cardHtml(c, fonts, cardWall), CARD.w, CARD.h, join(OUT, `${c.id}.jpg`))
} finally {
  await browser.close()
}
