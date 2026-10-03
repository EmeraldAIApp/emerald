// The living night, light tier (phones, slow machines, no WebGL, reduced motion): no WebGL at all.
//  - CSS fog: two soft blobs that drift on the compositor (transform only), tinted per section through registered
//    custom properties (html[data-tone], a 1.4 s color transition);
//  - CSS moonbeams from the top corner, slowly breathing;
//  - a violet dawn that rises under the roadmap;
//  - a small 2D-canvas snow (two depths, 30 fps, paused when the tab is hidden).
// Reduced motion / ?static: the same layers, still, and no snow.
import { still } from '../motion.js'

export function mountAtmosLite(): void {
  const root = document.createElement('div')
  root.className = 'fx-lite'
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML = '<i class="fx-lite__fog"></i><i class="fx-lite__fog fx-lite__fog--b"></i><i class="fx-lite__rays"></i><i class="fx-lite__dawn"></i>'
  document.body.prepend(root)
  document.documentElement.classList.add('has-lite')
  trackTone()
  if (!still()) mountLiteSnow(root)
}

/** html[data-tone] = the section that covers most of the screen. */
function trackTone(): void {
  const secs = [...document.querySelectorAll<HTMLElement>('main .sec[id]')]
  const ratio = new Map<string, number>()
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) ratio.set((e.target as HTMLElement).id, e.intersectionRect.height)
      let best = ''
      let max = 0
      for (const [id, h] of ratio) if (h > max) [best, max] = [id, h]
      if (best) document.documentElement.dataset.tone = best
    },
    { threshold: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1] },
  )
  secs.forEach((s) => io.observe(s))
}

function mountLiteSnow(root: HTMLElement): void {
  const canvas = document.createElement('canvas')
  canvas.className = 'fx-lite__snow'
  root.append(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(devicePixelRatio || 1, 1.5)
  let w = 0
  let h = 0
  type F = { x: number; y: number; r: number; v: number; a: number; ph: number; k: number }
  let flakes: F[] = []
  const make = (anywhere: boolean): F => {
    const near = Math.random() < 0.3
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -8,
      r: near ? 2 + Math.random() * 1.6 : 0.7 + Math.random() * 0.9,
      v: near ? 46 + Math.random() * 20 : 18 + Math.random() * 14,
      a: near ? 0.35 : 0.5,
      ph: Math.random() * 6.283,
      k: near ? 0.5 : 0.15, // scroll parallax
    }
  }
  const resize = () => {
    w = innerWidth
    h = innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    flakes = Array.from({ length: Math.min(70, Math.round((w * h) / 9000)) }, () => make(true))
  }
  resize()
  addEventListener('resize', resize, { passive: true })
  let lastScroll = scrollY
  let last = 0
  let raf = 0
  const frame = (t: number) => {
    raf = 0
    if (document.hidden) return
    raf = requestAnimationFrame(frame)
    if (last && t - last < 31) return // 30 fps is plenty for snow on a phone
    const dt = Math.min(0.1, last ? (t - last) / 1000 : 0.033)
    last = t
    const ds = scrollY - lastScroll
    lastScroll = scrollY
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#e6ebff'
    for (const f of flakes) {
      f.y += f.v * dt - ds * f.k
      if (f.y > h + 8) Object.assign(f, make(false))
      else if (f.y < -10) f.y = h + 6
      ctx.globalAlpha = f.a
      ctx.beginPath()
      ctx.arc(f.x + Math.sin(t / 1600 + f.ph) * 6, f.y, f.r, 0, 6.283)
      ctx.fill()
    }
  }
  const start = () => {
    if (!raf && !document.hidden) {
      last = 0
      raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener('visibilitychange', start)
  start()
}
