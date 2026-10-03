// Records the red verdict on the real Permit2 drainer case in Emerald.exe (CDP screencast), then encodes
// kit/out/demo.mp4 (H.264, for X) and kit/out/demo.gif. Against production it consumes ONE /api/chat check from the
// anon quota; against `npm run dev:mock` it uses the mock API (web/mock), built from the same real case.
// Usage: npx tsx kit/record-demo.ts --url https://<site>/?noboot [--case "Permit2 drainer"]
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { concatList, verdictFromSse, type Frame } from './demo.js'

const { values } = parseArgs({ options: { url: { type: 'string' }, case: { type: 'string' } } })
if (!values.url) {
  console.error('usage: npx tsx kit/record-demo.ts --url https://<site>/?noboot [--case "Permit2 drainer"]')
  process.exit(2)
}
const CASE = values.case ?? 'Permit2 drainer'
const OUT = 'kit/out'
const FRAMES = join(OUT, 'demo-frames')
const VIEW = { width: 1280, height: 720 }
rmSync(FRAMES, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await page.goto(values.url, { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].filter((i) => i.loading !== 'lazy').map((i) => i.decode().catch(() => {})))
  })
  // One window on screen: minimize the others with the site's own button (they go to the taskbar). Clicked from
  // the page, so the browser does not scroll to each button.
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll<HTMLButtonElement>('.win:not(#try) [data-min]')) btn.click()
  })
  await page.waitForTimeout(800) // minimize animations end
  // Frame the checker window: its title bar at the top of the screen.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto'
    const win = document.querySelector('#try')
    if (!win) throw new Error('no #try window (is this Emerald.exe?)')
    scrollTo(0, scrollY + win.getBoundingClientRect().top - 14)
  })
  await page.waitForTimeout(1800) // windows fade in, wallpaper settles

  const cdp = await context.newCDPSession(page)
  const frames: Frame[] = []
  cdp.on('Page.screencastFrame', (f) => {
    const file = join(FRAMES, `f${String(frames.length).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(f.data, 'base64'))
    frames.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 })
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) // may land after the browser closes
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1 })
  await page.waitForTimeout(1500) // idle: "Ready."

  const chat = page.waitForResponse((r) => r.url().includes('/api/chat'), { timeout: 90_000 })
  const started = page.waitForRequest((r) => r.url().includes('/api/chat'), { timeout: 2_500 }).then(
    () => true,
    () => false,
  )
  const chip = page.getByRole('button', { name: CASE })
  await chip.hover()
  await page.waitForTimeout(400)
  await chip.click()
  if (!(await started)) await page.getByRole('button', { name: 'Check', exact: true }).click() // chip only filled the input
  await page.getByText(/Don['’]t sign\./).first().waitFor({ timeout: 90_000 })
  const verdict = verdictFromSse(await (await chat).text())
  await page.waitForTimeout(4500) // the red wave crosses the wallpaper, the explanation finishes streaming
  await page.waitForTimeout(2000) // hold on the verdict, red title bar in frame
  await cdp.send('Page.stopScreencast')

  if (verdict.level !== 'red' || verdict.input.kind !== 'typedData') {
    throw new Error(`expected a red verdict on typed data, got ${verdict.level} on ${verdict.input.kind}`)
  }
  const last = frames.at(-1)
  if (!last) throw new Error('no frames captured')
  writeFileSync(join(FRAMES, 'frames.txt'), concatList(frames, last.t + 0.5))
  console.log(`${frames.length} frames, ${(last.t + 0.5 - frames[0]!.t).toFixed(1)} s, verdict ${verdict.level}`)
} finally {
  await browser.close()
}

execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(FRAMES, 'frames.txt'),
  '-vf', 'fps=30,scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart',
  join(OUT, 'demo.mp4')])
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', join(OUT, 'demo.mp4'), '-vf',
  'fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
  join(OUT, 'demo.gif')])
console.log(`${join(OUT, 'demo.mp4')}\n${join(OUT, 'demo.gif')}`)
