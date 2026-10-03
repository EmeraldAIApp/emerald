// Snow falling behind the window glass of each photo, plus a soft bloom on its moon.
// One small canvas per stage, sized to the window box only, masked by the plate's own luminance (mask-mode: luminance)
// so mullions and walls stay dark. It only runs while its section is on screen and the tab is visible.
import { activeGeo } from '../light/stage.js'
import { SCENES, type PlateScene } from './scene.js'

interface Flake { x: number; y: number; r: number; v: number; a: number; ph: number; sw: number }

function sprite(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(240,244,255,1)')
  grad.addColorStop(0.35, 'rgba(225,232,255,.75)')
  grad.addColorStop(1, 'rgba(210,220,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  return c
}

/** The moon bloom: a breathing halo over the photo's moon (also used by the mouse parallax). */
export function mountMoon(stage: HTMLElement): HTMLElement | null {
  let moon = stage.querySelector<HTMLElement>('.fx-moon')
  const place = () => {
    const sc: PlateScene | undefined = SCENES[activeGeo(stage)?.name ?? '']
    if (!sc) {
      moon?.remove()
      moon = null
      return
    }
    if (!moon) {
      moon = document.createElement('div')
      moon.className = 'fx-moon'
      moon.setAttribute('aria-hidden', 'true')
      stage.querySelector('.plate')?.after(moon)
    }
    const [x, y, r] = sc.moon
    moon.style.left = `${x * 100}%`
    moon.style.top = `${y * 100}%`
    moon.style.width = `${r * 2 * 2.6 * 100}%`
  }
  place()
  stage.addEventListener('stage:mapped', place)
  return moon
}

export function mountSnow(stage: HTMLElement): void {
  const canvas = document.createElement('canvas')
  canvas.className = 'fx-snow'
  canvas.setAttribute('aria-hidden', 'true')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const flake = sprite()
  let flakes: Flake[] = []
  let w = 0
  let h = 0
  let visible = false
  let raf = 0
  let last = 0
  const dpr = Math.min(devicePixelRatio || 1, 1.5)

  const layout = () => {
    const name = activeGeo(stage)?.name ?? ''
    const sc = SCENES[name]
    if (!sc) {
      canvas.remove()
      return false
    }
    if (!canvas.isConnected) stage.querySelector('.plate')?.after(canvas)
    const [x0, y0, x1, y1] = sc.win
    const fw = x1 - x0
    const fh = y1 - y0
    Object.assign(canvas.style, { left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${fw * 100}%`, height: `${fh * 100}%` })
    // The plate itself as a luminance mask, aligned with the full plate: bright glass shows snow, dark wood hides it.
    const img = stage.querySelector('img')
    const src = img?.currentSrc // never img.src: on a lazy plate that would start a second download
    if (src) {
      const pos = (o: number, f: number) => (f >= 1 ? '0%' : `${(o / (1 - f)) * 100}%`)
      canvas.style.setProperty('--snow-mask', `url("${src}")`)
      canvas.style.setProperty('--snow-mask-size', `${100 / fw}% ${100 / fh}%`)
      canvas.style.setProperty('--snow-mask-pos', `${pos(x0, fw)} ${pos(y0, fh)}`)
    }
    const sw = stage.clientWidth * fw
    const sh = stage.clientHeight * fh
    if (!sw || !sh) return false
    w = sw
    h = sh
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const count = Math.min(170, Math.round((w * h) / 2600))
    flakes = Array.from({ length: count }, () => newFlake(true))
    return true
  }

  function newFlake(anywhere: boolean): Flake {
    const depth = Math.random() // 0 = far, 1 = near
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -6,
      r: 0.5 + depth * depth * 2.4,
      v: 9 + depth * 34,
      a: 0.35 + depth * 0.6,
      ph: Math.random() * Math.PI * 2,
      sw: 6 + Math.random() * 14,
    }
  }

  const frame = (t: number) => {
    raf = 0
    if (!visible || document.hidden) return
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016)
    last = t
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const time = t / 1000
    for (const f of flakes) {
      f.y += f.v * dt
      if (f.y > h + 6) Object.assign(f, newFlake(false))
      const x = f.x + Math.sin(time * 0.6 + f.ph) * f.sw * 0.5
      const s = f.r * 4
      ctx.globalAlpha = f.a
      ctx.drawImage(flake, x - s / 2, f.y - s / 2, s, s)
    }
    raf = requestAnimationFrame(frame)
  }
  const start = () => {
    if (!raf && visible && !document.hidden) {
      last = 0
      raf = requestAnimationFrame(frame)
    }
  }

  if (!layout()) return
  new ResizeObserver(() => layout()).observe(stage)
  stage.addEventListener('stage:mapped', () => layout())
  stage.querySelector('img')?.addEventListener('load', () => layout())
  new IntersectionObserver(([e]) => {
    visible = Boolean(e?.isIntersecting)
    start()
  }).observe(stage.closest('.sec') ?? stage)
  document.addEventListener('visibilitychange', start)
}
