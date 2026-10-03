// / (Emerald.exe) screensaver: after ~25 s without input (desktop only), pixel emeralds fly toward the camera, a homage to the
// classic Windows "Starfield". Any input wakes the desktop. Never on phones, never with reduced motion, never under
// automation (screenshots stay clean) unless forced with ?screensaver.

const calm = matchMedia('(prefers-reduced-motion: reduce)')
const wide = matchMedia('(min-width: 900px) and (pointer: fine)')

// 9x9 pixel emerald: o outline, L light, W glint, G body, D shade
const GEM = ['..ooooo..', '.oLLWLLo.', 'oLLWLLGGo', 'oLWLLGGGo', 'oLLLGGGGo', 'oLLGGGGDo', 'oGGGGGDDo', '.oGGGDDo.', '..ooooo..']
export const GREEN: Record<string, string> = { o: '#0f5a33', L: '#8ff5bd', W: '#ffffff', G: '#3ce68c', D: '#1f9d5a' }
export const ETHY: Record<string, string> = { o: '#2c2680', L: '#c9cffb', W: '#ffffff', G: '#8f9cf3', D: '#5d5fd6' }
export const MAX_SCALE = 9

/** Pre-rendered sprites per integer scale (nearest-neighbour, no smoothing at draw time). */
export function sprites(colors: Record<string, string>): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = []
  for (let s = 1; s <= MAX_SCALE; s++) {
    const c = document.createElement('canvas')
    c.width = c.height = 9 * s
    const g = c.getContext('2d')!
    GEM.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const fill = colors[ch]
        if (!fill) return
        g.fillStyle = fill
        g.fillRect(x * s, y * s, s, s)
      }),
    )
    out.push(c)
  }
  return out
}

export interface ScreensaverOpts {
  idleMs?: number
  force?: boolean
  /** True while something is in progress (a check streaming): the saver waits. */
  busy?: () => boolean
  onShow?: () => void
  onHide?: () => void
}

export function mountScreensaver(opts: ScreensaverOpts = {}): { show(): void; hide(): void } {
  const idleMs = opts.idleMs ?? 25_000
  const auto = (navigator as Navigator & { webdriver?: boolean }).webdriver === true
  let lastInput = performance.now()
  let el: HTMLElement | undefined
  let canvas: HTMLCanvasElement | undefined
  let ctx: CanvasRenderingContext2D | null = null
  let raf = 0
  let active = false
  let shownAt = 0
  let bg: HTMLCanvasElement | undefined
  let green: HTMLCanvasElement[] = []
  let ethy: HTMLCanvasElement[] = []
  type P = { x: number; y: number; z: number; kind: 0 | 1 | 2 }
  const ps: P[] = []
  const N = 170

  const spawn = (p: P, far = true): void => {
    p.x = (Math.random() * 2 - 1) * 1.1
    p.y = (Math.random() * 2 - 1) * 0.75
    p.z = far ? 0.85 + Math.random() * 0.25 : 0.08 + Math.random()
    const r = Math.random()
    p.kind = r < 0.55 ? 0 : r < 0.72 ? 1 : 2 // emerald, ETH-blue gem, dust star
  }

  function build(): void {
    el = document.createElement('div')
    el.className = 'saver'
    el.setAttribute('aria-hidden', 'true')
    canvas = document.createElement('canvas')
    const hint = document.createElement('p')
    hint.className = 'saver__hint'
    hint.textContent = 'Emerald.exe · move the mouse to wake'
    el.append(canvas, hint)
    document.body.append(el)
    ctx = canvas.getContext('2d', { alpha: false })
    green = sprites(GREEN)
    ethy = sprites(ETHY)
    for (let i = 0; i < N; i++) {
      const p = { x: 0, y: 0, z: 0, kind: 0 } as P
      spawn(p, false)
      ps.push(p)
    }
  }

  function size(): void {
    if (!canvas) return
    // half resolution, upscaled with image-rendering: pixelated: chunky pixels and a cheap fill
    const w = Math.ceil(innerWidth / 2)
    const h = Math.ceil(innerHeight / 2)
    if (canvas.width === w && canvas.height === h) return
    canvas.width = w
    canvas.height = h
    bg = document.createElement('canvas')
    bg.width = w
    bg.height = h
    const g = bg.getContext('2d')!
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2)
    grad.addColorStop(0, '#221b78')
    grad.addColorStop(0.55, '#110d45')
    grad.addColorStop(1, '#05041a')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
  }

  let last = 0
  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    if (!ctx || !canvas || !bg) return
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
    last = now
    const w = canvas.width
    const h = canvas.height
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bg, 0, 0)
    const f = Math.min(w, h) * 0.55
    // warp in: the first second accelerates from a standstill
    const speed = 0.3 * Math.min(1, (now - shownAt) / 1400) + 0.02
    // far first, so near gems draw on top
    ps.sort((a, b) => b.z - a.z)
    for (const p of ps) {
      p.z -= speed * dt
      if (p.z <= 0.04) {
        spawn(p)
        continue
      }
      const sx = w / 2 + (p.x / p.z) * f
      const sy = h / 2 + (p.y / p.z) * f
      if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) {
        spawn(p)
        continue
      }
      const fade = Math.min(1, (1.05 - p.z) * 3)
      ctx.globalAlpha = fade
      if (p.kind === 2) {
        const s = p.z < 0.25 ? 2 : 1
        ctx.fillStyle = '#e8e6ff'
        ctx.fillRect(Math.round(sx), Math.round(sy), s, s)
      } else {
        const sc = Math.max(1, Math.min(MAX_SCALE, Math.round(0.6 / p.z)))
        const img = (p.kind === 0 ? green : ethy)[sc - 1]!
        ctx.drawImage(img, Math.round(sx - img.width / 2), Math.round(sy - img.height / 2))
      }
    }
    ctx.globalAlpha = 1
  }

  function show(): void {
    if (active || calm.matches) return
    if (!el) build()
    size()
    active = true
    shownAt = performance.now()
    last = shownAt
    el!.classList.add('is-on')
    document.documentElement.classList.add('is-saving')
    opts.onShow?.()
    raf = requestAnimationFrame(frame)
  }

  function hide(): void {
    if (!active) return
    active = false
    lastInput = performance.now()
    el?.classList.remove('is-on')
    document.documentElement.classList.remove('is-saving')
    opts.onHide?.()
    // keep painting through the fade-out, then stop
    setTimeout(() => {
      if (!active) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }, 260)
  }

  // ---- input: any of these wakes the desktop and resets the idle clock
  let lx = -1
  let ly = -1
  const onInput = (e: Event): void => {
    if (e.type === 'pointermove') {
      const pe = e as PointerEvent
      // Ignore sensor jitter and the synthetic same-position moves browsers fire when the content under a still
      // cursor changes (the saver appearing is one). The first move only records where the pointer is.
      const first = lx < 0
      const moved = Math.abs(pe.clientX - lx) + Math.abs(pe.clientY - ly)
      lx = pe.clientX
      ly = pe.clientY
      if (first || moved < 3) return
    }
    lastInput = performance.now()
    if (!active) return
    // the wake-up click or key does not reach the page underneath
    if (e.type === 'pointerdown' || e.type === 'keydown') {
      e.preventDefault()
      e.stopPropagation()
    }
    hide()
  }
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) {
    addEventListener(type, onInput, { capture: true, passive: type !== 'pointerdown' && type !== 'keydown' })
  }
  addEventListener('scroll', () => (lastInput = performance.now()), { passive: true })
  addEventListener('resize', () => active && size(), { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else {
      lastInput = performance.now()
      if (active) raf = requestAnimationFrame(frame)
    }
  })

  setInterval(() => {
    if (active || document.hidden || calm.matches || auto || !wide.matches) return
    if (opts.busy?.()) {
      lastInput = performance.now()
      return
    }
    if (performance.now() - lastInput > idleMs) show()
  }, 1000)

  if (opts.force) setTimeout(show, 400)
  return { show, hide }
}
