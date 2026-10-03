// Renders the three banner-art variants (kit/templates.ts bannerArtHtml) plus a preview sheet with X's avatar circle
// and the mobile crop. Usage: npx tsx kit/render-banners.ts
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { BANNER_ART, BANNER_ARTS, bannerArtHtml, CELL, gem, type KitFonts } from './templates.js'
import { wallpaperUri } from './wallpaper.js'

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

const browser = await chromium.launch()
try {
  const files: string[] = []
  for (const [i, v] of BANNER_ARTS.entries()) {
    const a = BANNER_ART[v]
    const wall = wallpaperUri({
      w: cell(1500),
      h: cell(500),
      t: a.t,
      lift: a.lift,
      halo: { x: cell(a.halo.x), y: cell(a.halo.y), r: cell(a.halo.r), peak: a.halo.peak },
    })
    const page = await browser.newPage({ viewport: { width: 1500, height: 500 }, deviceScaleFactor: 1 })
    await page.setContent(bannerArtHtml(v, fonts, wall), { waitUntil: 'load' })
    const ok = await page.evaluate(async () => {
      await document.fonts.load('700 64px "Pixelify Sans"')
      await document.fonts.load('500 26px "IBM Plex Mono"')
      return document.fonts.check('700 64px "Pixelify Sans"')
    })
    if (!ok) throw new Error(`Pixelify Sans not loaded for ${v}`)
    const out = join(OUT, `banner-v${i + 1}.jpg`)
    await page.screenshot({ path: out, type: 'jpeg', quality: 95 })
    await page.close()
    files.push(out)
    console.log(`${out}  1500x500  (${v})`)
  }

  // Preview sheet: each banner as X desktop shows it (600x200, the 134 px avatar straddling the bottom left edge),
  // next to the middle 1500x360 band that some mobile screens keep.
  const rows = files
    .map((file, i) => {
      const uri = dataUri(file, 'image/jpeg')
      return `<section><h2>V${i + 1} · ${BANNER_ARTS[i]}</h2><div class="pair">
<figure class="desk"><div class="hdr" style="background-image:url(${uri})"></div><div class="ava">${gem(6)}</div><figcaption>desktop · 600x200 + avatar 134</figcaption></figure>
<figure class="mob"><div class="crop" style="background-image:url(${uri})"></div><figcaption>mobile crop · middle 1500x360</figcaption></figure></div></section>`
    })
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "IBM Plex Mono"; src: url(${fonts.mono}) format("woff2"); font-weight: 500; }
* { box-sizing: border-box; margin: 0; }
body { width: 1240px; background: #15202b; color: #8b98a5; font: 500 14px/1.3 "IBM Plex Mono", monospace; padding: 28px 28px 8px; }
section { margin-bottom: 26px; } h2 { font-size: 15px; color: #e7e9ea; margin-bottom: 10px; }
.pair { display: flex; gap: 28px; align-items: flex-start; }
figure { position: relative; } figcaption { margin-top: 8px; }
.hdr { width: 600px; height: 200px; background-size: 600px 200px; }
.desk { padding-bottom: 70px; } .desk figcaption { position: absolute; left: 166px; top: 212px; margin: 0; }
.ava { position: absolute; left: 16px; top: 133px; width: 134px; height: 134px; border-radius: 50%; border: 4px solid #15202b;
  background: #667eea; display: grid; place-items: center; overflow: hidden; }
.crop { width: 556px; height: 133px; background-size: 556px 185px; background-position: 0 -26px; }
</style></head><body>${rows}</body></html>`
  const page = await browser.newPage({ viewport: { width: 1240, height: 400 }, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: join(OUT, 'banner-previews.jpg'), type: 'jpeg', quality: 92, fullPage: true })
  await page.close()
  console.log(join(OUT, 'banner-previews.jpg'))
} finally {
  await browser.close()
}
