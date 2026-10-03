// X images for the pinned post and the launch post: the room photo (web/public/room/room.webp) with the CRT switched on.
// The screen carries one word next to the pixel gem; everything else is said in the post text.
// Usage: npx tsx kit/render-room-cards.ts
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const OUT = 'kit/out'
mkdirSync(OUT, { recursive: true })
const uri = (file: string, type: string) => `data:${type};base64,${readFileSync(file).toString('base64')}`
const ROOM = uri('web/public/room/room.webp', 'image/webp')
const PIXEL = uri('web/public/fonts/PixelifySans-400-700.woff2', 'font/woff2')
const MONO = uri('web/public/fonts/IBMPlexMono-Medium.woff2', 'font/woff2')

// Same measurements as web/src/room (in % of the photo).
const CRT = { x: 35.68, y: 13.09, w: 25, h: 33.53 }
const LED = { x: 56.78, y: 51.9 }
const GEM = `<svg viewBox="0 0 20 20" shape-rendering="crispEdges"><path d="M6 1h8l5 5v8l-5 5H6l-5-5V6z" fill="#3ce68c" stroke="#0f5a33" stroke-width="1.2"/><path d="M7 5h6l2 2v6l-2 2H7l-2-2V7z" fill="#8ff5bd"/><path d="M7.5 6.5h3l1 1" stroke="#fff" stroke-width="1.2" fill="none"/></svg>`

interface Card {
  file: string
  word: string
  line: string
}
const CARDS: Card[] = [
  { file: 'card-pinned.jpg', word: 'EMERALD AI', line: 'aiemerald.app' },
  { file: 'card-launch.jpg', word: '$EMERALD', line: 'live on Ethereum' },
]

const W = 1600
const H = Math.round(W / (2752 / 1536))

const html = (c: Card) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Pixel; src: url(${PIXEL}) format("woff2"); font-weight: 400 700; }
@font-face { font-family: Mono; src: url(${MONO}) format("woff2"); font-weight: 500; }
* { margin: 0; box-sizing: border-box; }
body { width: ${W}px; height: ${H}px; position: relative; overflow: hidden; background: #0b0a24; }
.photo { position: absolute; inset: 0; width: 100%; height: 100%; }
/* the light of the screen on the plastic, the desk and the room */
.spill { position: absolute; left: ${CRT.x - 14}%; top: ${CRT.y - 12}%; width: ${CRT.w + 28}%; height: ${CRT.h + 40}%;
  background: radial-gradient(closest-side, rgb(60 230 140 / .26), rgb(60 230 140 / .08) 60%, transparent); mix-blend-mode: screen; }
.crt { position: absolute; left: ${CRT.x}%; top: ${CRT.y}%; width: ${CRT.w}%; height: ${CRT.h}%; border-radius: 3% / 4.5%; overflow: hidden;
  background: radial-gradient(ellipse at 50% 45%, #12352a, #06120d 72%, #020403); container-type: size;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4cqh; }
.crt::after { content: ""; position: absolute; inset: 0;
  background: radial-gradient(30% 26% at 78% 22%, rgb(200 210 255 / .08), transparent 70%),
    repeating-linear-gradient(transparent 0 2px, rgb(0 0 0 / .25) 2px 3px),
    radial-gradient(80% 78% at 50% 50%, transparent 55%, rgb(0 0 0 / .6)); }
.gem { width: 22cqh; height: 22cqh; filter: drop-shadow(0 0 3cqh rgb(60 230 140 / .7)); }
.gem svg { width: 100%; height: 100%; }
.word { font: 700 14cqh/1 Pixel; color: #3ce68c; letter-spacing: .02em; text-shadow: 0 0 2.5cqh rgb(60 230 140 / .55); white-space: nowrap; }
.line { font: 500 6cqh/1 Mono; color: #8ff5bd; letter-spacing: .04em; opacity: .9; text-shadow: 0 0 1.5cqh rgb(60 230 140 / .4); }
.led { position: absolute; left: ${LED.x}%; top: ${LED.y}%; width: .45%; aspect-ratio: 1; translate: -50% -50%; border-radius: 50%;
  background: #3ce68c; box-shadow: 0 0 8px 2px rgb(60 230 140 / .8); }
</style></head><body>
<img class="photo" src="${ROOM}" alt="">
<div class="spill"></div>
<div class="crt"><div class="gem">${GEM}</div><div class="word">${c.word}</div><div class="line">${c.line}</div></div>
<i class="led"></i>
</body></html>`

const browser = await chromium.launch()
try {
  for (const c of CARDS) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
    await page.setContent(html(c), { waitUntil: 'load' })
    await page.evaluate(() => Promise.all(['700 40px Pixel', '500 20px Mono'].map((f) => document.fonts.load(f))))
    await page.screenshot({ path: `${OUT}/${c.file}`, type: 'jpeg', quality: 90 })
    await page.close()
    console.log(`${OUT}/${c.file} ${W}x${H}`)
  }
} finally {
  await browser.close()
}
