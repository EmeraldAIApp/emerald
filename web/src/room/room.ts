// The room (/ on desktop, once per session): an old PC on a desk on a snowy night. The power button turns it on, the
// camera moves into the screen, "Emerald AI" boots there, and the screen becomes the Emerald.exe desktop underneath.
// Same technique as the crt-room template: one photo, everything placed in % of it, the camera is a transform.
import { ETHY, GREEN, MAX_SCALE, sprites } from '../exe/screensaver.js'
import { sfx } from '../exe/sound.js'

const AR = 2752 / 1536
/** The CRT glass, in % of the photo. */
const CRT = { x: 35.68, y: 13.09, w: 25, h: 33.53 }
/** What must always be in the first frame, whatever the screen shape: the monitor, the tower and the keyboard. */
const FOCUS = { x: 19, y: 3, w: 57, h: 88 }
/** Window panes where it snows (x, y, w, h in %), clear of the monitor, the plants and the lamp. */
const PANES = [
  [24.5, 0, 6.5, 22],
  [61, 0, 6.5, 30],
  [31, 0, 30, 8],
] as const

const BOOT = ['EMERALD AI', 'Before you sign anything,', 'Emerald tells you', 'what it really does.']

type View = 'wide' | 'close' | 'enter'

/**
 * The way in: the screensaver's pixel emeralds fly out of the screen, slow at first, then faster and faster while the
 * camera dives into the glass. Drawn at a low resolution and upscaled with hard pixels, like the screensaver.
 */
function warp(canvas: HTMLCanvasElement, ms: number): () => void {
  canvas.width = 360
  canvas.height = 270
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return () => {}
  ctx.imageSmoothingEnabled = false
  const green = sprites(GREEN)
  const ethy = sprites(ETHY)
  const w = canvas.width
  const h = canvas.height
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2)
  grad.addColorStop(0, '#2a2190')
  grad.addColorStop(0.55, '#110d45')
  grad.addColorStop(1, '#05041a')
  type P = { x: number; y: number; z: number; pz: number; kind: number }
  const spawn = (p: P, far: boolean): void => {
    p.x = (Math.random() * 2 - 1) * 1.1
    p.y = (Math.random() * 2 - 1) * 0.8
    p.z = p.pz = far ? 0.9 + Math.random() * 0.2 : 0.1 + Math.random()
    const r = Math.random()
    p.kind = r < 0.5 ? 0 : r < 0.68 ? 1 : 2
  }
  const ps: P[] = Array.from({ length: 150 }, () => {
    const p = { x: 0, y: 0, z: 0, pz: 0, kind: 0 }
    spawn(p, false)
    return p
  })
  const f = Math.min(w, h) * 0.6
  const t0 = performance.now()
  let last = t0
  let raf = 0
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const e = Math.min(1, (now - t0) / ms)
    const speed = 0.25 + 3.2 * e ** 2.4
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    ps.sort((a, b) => b.z - a.z)
    for (const p of ps) {
      p.pz = p.z
      p.z -= speed * dt
      if (p.z <= 0.04) {
        spawn(p, true)
        continue
      }
      const sx = w / 2 + (p.x / p.z) * f
      const sy = h / 2 + (p.y / p.z) * f
      if (sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) {
        spawn(p, true)
        continue
      }
      ctx.globalAlpha = Math.min(1, (1.1 - p.z) * 3)
      if (p.kind === 2) {
        // dust stretches into streaks as the speed builds
        ctx.strokeStyle = '#e8e6ff'
        ctx.lineWidth = p.z < 0.3 ? 2 : 1
        ctx.beginPath()
        ctx.moveTo(Math.round(w / 2 + (p.x / p.pz) * f), Math.round(h / 2 + (p.y / p.pz) * f))
        ctx.lineTo(Math.round(sx), Math.round(sy))
        ctx.stroke()
      } else {
        const sc = Math.max(1, Math.min(MAX_SCALE, Math.round(0.55 / p.z)))
        const img = (p.kind === 0 ? green : ethy)[sc - 1]!
        ctx.drawImage(img, Math.round(sx - img.width / 2), Math.round(sy - img.height / 2))
      }
    }
    ctx.globalAlpha = 1
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}

export function mountRoom(): Promise<void> {
  const root = document.documentElement
  const found = document.querySelector<HTMLElement>('.room')
  if (!root.classList.contains('is-room') || !found) {
    found?.remove()
    return Promise.resolve()
  }
  const room = found
  const scene = room.querySelector<HTMLElement>('.room__scene')!
  const screen = room.querySelector<HTMLElement>('.room__screen')!
  const power = room.querySelector<HTMLButtonElement>('.room__power')!
  const snow = room.querySelector<HTMLCanvasElement>('.room__snow')!
  const photo = room.querySelector<HTMLImageElement>('.room__photo')!

  let W = 0
  let H = 0
  let view: View = 'wide'

  function frame(v: View): string {
    const vw = innerWidth
    const vh = innerHeight
    if (v === 'wide') {
      // cover the view with the photo; on very wide or very tall screens shrink just enough to keep the whole PC in
      // view (the blurred copy of the room fills the sides)
      const s = Math.min(1, Math.min(vw / ((FOCUS.w / 100) * W), vh / ((FOCUS.h / 100) * H)) * 0.97)
      const fx = ((FOCUS.x + FOCUS.w / 2) / 100) * W * s
      const fy = ((FOCUS.y + FOCUS.h / 2) / 100) * H * s
      const fit = (view: number, size: number, focus: number): number =>
        size <= view ? (view - size) / 2 : Math.min(0, Math.max(view - size, view / 2 - focus))
      return `translate(${fit(vw, W * s, fx)}px, ${fit(vh, H * s, fy)}px) scale(${s})`
    }
    const rw = (CRT.w / 100) * W
    const rh = (CRT.h / 100) * H
    // close: the screen fills most of the view with the bezel around it; enter: the glass covers the whole view
    const s = v === 'close' ? Math.min((vw * 0.84) / rw, (vh * 0.84) / rh) : Math.max(vw / rw, vh / rh) * 1.03
    const cx = ((CRT.x + CRT.w / 2) / 100) * W
    const cy = ((CRT.y + CRT.h / 2) / 100) * H
    return `translate(${vw / 2 - cx * s}px, ${vh / 2 - cy * s}px) scale(${s})`
  }
  function layout(): void {
    W = Math.max(innerWidth, innerHeight * AR)
    H = W / AR
    scene.style.width = `${W}px`
    scene.style.height = `${H}px`
    scene.style.transform = frame(view)
    snow.width = Math.round(W)
    snow.height = Math.round(H)
  }
  function camera(v: View): void {
    view = v
    scene.style.transform = frame(v)
  }
  addEventListener('resize', layout)
  layout()
  void photo.decode().catch(() => {}).then(() => room.classList.add('is-ready'))

  // ---- snow behind the glass of the window (decorative)
  const ctx = snow.getContext('2d')
  const flakes = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, v: 0.0006 + Math.random() * 0.0012, d: Math.random() * 6.28 }))
  let raf = 0
  const tick = (t: number): void => {
    if (!ctx) return
    ctx.clearRect(0, 0, snow.width, snow.height)
    ctx.save()
    ctx.beginPath()
    for (const [x, y, w, h] of PANES) ctx.rect((x / 100) * snow.width, (y / 100) * snow.height, (w / 100) * snow.width, (h / 100) * snow.height)
    ctx.clip()
    ctx.fillStyle = 'rgba(235, 238, 255, .75)'
    const k = snow.width / 1344
    for (const f of flakes) {
      f.y += f.v
      if (f.y > 0.35) f.y = 0
      const x = (0.2 + f.x * 0.52 + Math.sin(t / 1400 + f.d) * 0.004) * snow.width
      ctx.beginPath()
      ctx.arc(x, f.y * snow.height, f.r * k, 0, 6.29)
      ctx.fill()
    }
    ctx.restore()
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return new Promise((done) => {
    let phase: 'off' | 'booting' | 'entering' | 'gone' = 'off'
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, f: () => void): void => void timers.push(setTimeout(f, ms))

    /** Into the screen. fast = the Skip button or a key: no warp, just the camera and the fade. */
    function enter(fast = false): void {
      if (phase === 'entering' || phase === 'gone') return
      phase = 'entering'
      timers.forEach(clearTimeout)
      if (view !== 'close') camera('close')
      room.dataset.phase = 'entering'
      room.classList.toggle('is-fast', fast)
      const DIVE = fast ? 0 : 1500
      let stopWarp = (): void => {}
      if (!fast) {
        const c = document.createElement('canvas')
        c.className = 'room__warp'
        c.setAttribute('aria-hidden', 'true')
        screen.append(c)
        stopWarp = warp(c, DIVE + 500)
      }
      // let the gems get going inside the screen, then dive into the glass
      at(fast ? 0 : 450, () => requestAnimationFrame(() => camera('enter')))
      at(DIVE + (fast ? 300 : 250), () => room.classList.add('is-out'))
      // the desktop starts its entrance while the room fades
      at(DIVE + (fast ? 320 : 300), done)
      at(DIVE + (fast ? 800 : 900), () => {
        phase = 'gone'
        stopWarp()
        cancelAnimationFrame(raf)
        removeEventListener('resize', layout)
        removeEventListener('keydown', onKey, true)
        root.classList.remove('is-room')
        try {
          sessionStorage.setItem('emerald.room', '1')
        } catch {
          /* ignore */
        }
        room.remove()
        document.querySelector<HTMLTextAreaElement>('#chat-input')?.focus({ preventScroll: true })
      })
    }

    function powerOn(): void {
      if (phase !== 'off') return
      phase = 'booting'
      sfx('boot')
      room.dataset.phase = 'on'
      power.setAttribute('aria-pressed', 'true')
      camera('close')
      const out = document.createElement('pre')
      out.className = 'room__boot'
      out.innerHTML = '<span class="room__gem" aria-hidden="true"></span>'
      screen.append(out)
      let t = 520
      for (const line of BOOT) {
        const el = document.createElement('span')
        el.className = line === BOOT[0] ? 'room__line room__title' : 'room__line'
        out.append(el)
        const text = line
        at(t, () => {
          out.querySelector('.is-typing')?.classList.remove('is-typing')
          el.classList.add('is-typing')
        })
        for (let i = 1; i <= text.length; i++) {
          const n = i
          at(t, () => (el.textContent = text.slice(0, n)))
          t += 20
        }
        t += 260
      }
      at(t + 900, () => enter())
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' || ((e.key === 'Enter' || e.key === ' ') && phase === 'booting')) {
        e.preventDefault()
        if (phase === 'off' || phase === 'booting') enter(true)
      }
    }
    addEventListener('keydown', onKey, true)
    power.addEventListener('click', powerOn)
    room.querySelector('.room__crt')?.addEventListener('click', () => (phase === 'off' ? powerOn() : enter()))
    room.querySelector('.room__skip')?.addEventListener('click', () => enter(true))
    power.focus({ preventScroll: true })
  })
}
