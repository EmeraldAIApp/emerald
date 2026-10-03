// Records the room boot on the real site (CDP screencast): the old PC in the snowy room, the power button, the CRT
// turning on, the boot text and the dive into Emerald.exe. Encodes kit/out/room-boot.mp4 (H.264, for X).
// No API call is made. Usage: npx tsx kit/record-room.ts --url https://<site>/?room
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { concatList, type Frame } from './demo.js'

const { values } = parseArgs({ options: { url: { type: 'string' }, hold: { type: 'string' } } })
if (!values.url) {
  console.error('usage: npx tsx kit/record-room.ts --url https://<site>/?room [--hold 11000]')
  process.exit(2)
}
const HOLD = Number(values.hold ?? 11000) // ms recorded after the click: boot text, dive, desktop settles
const OUT = 'kit/out'
const FRAMES = join(OUT, 'room-frames')
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
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})))
  })
  const power = page.locator('.room__power')
  await power.waitFor({ timeout: 10_000 })
  await page.waitForTimeout(1200) // the room fades in

  const cdp = await context.newCDPSession(page)
  const frames: Frame[] = []
  cdp.on('Page.screencastFrame', (f) => {
    const file = join(FRAMES, `f${String(frames.length).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(f.data, 'base64'))
    frames.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 })
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1 })
  await page.waitForTimeout(2200) // the room at night, snow falling
  await power.hover()
  await page.waitForTimeout(500)
  await power.click()
  await page.waitForTimeout(HOLD)
  await cdp.send('Page.stopScreencast')

  const last = frames.at(-1)
  if (!last) throw new Error('no frames captured')
  writeFileSync(join(FRAMES, 'frames.txt'), concatList(frames, last.t + 0.5))
  console.log(`${frames.length} frames, ${(last.t + 0.5 - frames[0]!.t).toFixed(1)} s`)
} finally {
  await browser.close()
}

execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(FRAMES, 'frames.txt'),
  '-vf', 'fps=30,scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart',
  join(OUT, 'room-boot.mp4')])
rmSync(FRAMES, { recursive: true, force: true })
console.log(join(OUT, 'room-boot.mp4'))
