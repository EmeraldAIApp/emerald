// Cinematic scroll (rich tier only): Lenis smooth scroll driving GSAP ScrollTrigger.
//  - every photo dollies in as its section arrives (scale 1.1 -> 1 exactly when the section reaches the top: the
//    screenshot position is the untouched board composition) and lags behind as it leaves;
//  - the hero photo, its moon bloom, copy and panel answer the mouse at three depths;
//  - every photo breathes (a slow camera dolly) and answers the mouse with its own depth, not only the hero;
//  - the loupe hairlines are redrawn whenever a photo or a panel moves ('stage:moved').
// Only transforms are scrubbed (no opacity), so a capture at any scroll position never finds hidden content.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

const moved = (stage: Element) => stage.dispatchEvent(new CustomEvent('stage:moved'))

export function mountScroll(): Lenis {
  const lenis = new Lenis({
    lerp: 0.085,
    wheelMultiplier: 0.95,
    anchors: { offset: -24 },
    // The panel screen and the textarea scroll on their own.
    prevent: (node) => Boolean(node.closest?.('.dv__scroll, textarea')),
  })
  document.documentElement.classList.add('has-lenis')
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)

  for (const sec of document.querySelectorAll<HTMLElement>('main .sec')) {
    const stage = sec.querySelector<HTMLElement>('.sec__bg [data-stage]')
    if (!stage) continue
    const update = () => moved(stage)
    if (sec.classList.contains('hero')) {
      // The hero starts at the top: only the exit moves (the photo lags, the copy and the panel lift away faster).
      gsap.set(stage, { scale: 1.03 }) // overscan for the mouse parallax; the bracelet barely moves
      gsap.to(stage, { yPercent: 14, ease: 'none', scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom top', scrub: true, onUpdate: update } })
      gsap.to('.hero__copy', { y: -90, ease: 'none', scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom top', scrub: true } })
      gsap.to('.hero__panel', { y: -40, ease: 'none', scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom top', scrub: true, onUpdate: update } })
      continue
    }
    gsap.fromTo(
      stage,
      { scale: 1.12 },
      { scale: 1, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top top', scrub: true, onUpdate: update } },
    )
    gsap.to(stage, { yPercent: 9, ease: 'none', scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom top', scrub: true, onUpdate: update } })
    // Panels drift up into place a little faster than the page (depth), and land exactly at the board position.
    for (const panel of sec.querySelectorAll<HTMLElement>('.sec__in > .dv, .sec__in > * > .dv, .book__side')) {
      gsap.fromTo(panel, { y: 70 }, { y: 0, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top top', scrub: true, onUpdate: update } })
    }
  }

  mountMouse()
  mountBreath()
  // Plates and fonts change the page height after load.
  addEventListener('load', () => ScrollTrigger.refresh())
  void document.fonts?.ready.then(() => ScrollTrigger.refresh())
  return lenis
}

/** The hero answers the mouse at three depths: photo (far), moon bloom (farther), copy and panel (near). */
function mountMouse(): void {
  const hero = document.querySelector<HTMLElement>('.hero')
  const stage = hero?.querySelector<HTMLElement>('[data-stage]')
  if (!hero || !stage) return
  const layer = (sel: string | Element | null, k: number, ky = k) => {
    if (!sel) return null
    const x = gsap.quickTo(sel, 'x', { duration: 1.1, ease: 'power3.out' })
    const y = gsap.quickTo(sel, 'y', { duration: 1.1, ease: 'power3.out' })
    return (nx: number, ny: number) => {
      x(nx * k)
      y(ny * ky)
    }
  }
  const layers = [
    layer(stage, -14, -9),
    layer(stage.querySelector('.fx-moon'), -16, -10), // inside the stage: adds to its motion
    layer('.hero__copy > *', 4, 3),
  ].filter(Boolean) as ((nx: number, ny: number) => void)[]
  // The panel's y belongs to the scroll tween: the mouse moves it with the individual `translate` property instead.
  const panel = document.querySelector<HTMLElement>('.hero__panel')
  let inView = true
  new IntersectionObserver(([e]) => (inView = Boolean(e?.isIntersecting))).observe(hero)
  let until = 0
  let px = 0
  let py = 0
  let tx = 0
  let ty = 0
  addEventListener(
    'pointermove',
    (e) => {
      if (!inView || e.pointerType !== 'mouse') return
      tx = (e.clientX / innerWidth) * 2 - 1
      ty = (e.clientY / innerHeight) * 2 - 1
      for (const l of layers) l(tx, ty)
      until = performance.now() + 1400
    },
    { passive: true },
  )
  gsap.ticker.add(() => {
    if (performance.now() > until) return
    px += (tx - px) * 0.06
    py += (ty - py) * 0.06
    if (panel) panel.style.translate = `${(px * 7).toFixed(2)}px ${(py * 5).toFixed(2)}px`
    moved(stage)
  })
}

/**
 * 2.5D for every photo on screen: a slow camera "breath" (scale 1.014 <-> 1.030, enough overscan for the 9 px of mouse travel, each section out of phase) plus a
 * mouse parallax for the photos below the hero (the hero has its own rig above). Individual `scale`/`translate`
 * properties compose with the GSAP transform, so the scroll dolly stays untouched; the loupes are redrawn each frame.
 */
function mountBreath(): void {
  const items = [...document.querySelectorAll<HTMLElement>('main .sec')]
    .map((sec, i) => ({ sec, i, stage: sec.querySelector<HTMLElement>('.sec__bg [data-stage]'), on: false }))
    .filter((x): x is { sec: HTMLElement; i: number; stage: HTMLElement; on: boolean } => Boolean(x.stage))
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const it = items.find((x) => x.sec === e.target)
      if (it) it.on = e.isIntersecting
    }
  })
  items.forEach((x) => io.observe(x.sec))
  let tx = 0
  let ty = 0
  let px = 0
  let py = 0
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return
      tx = (e.clientX / innerWidth) * 2 - 1
      ty = (e.clientY / innerHeight) * 2 - 1
    },
    { passive: true },
  )
  gsap.ticker.add((time) => {
    px += (tx - px) * 0.045
    py += (ty - py) * 0.045
    for (const it of items) {
      if (!it.on || document.hidden) continue
      const b = 0.5 + 0.5 * Math.sin((time * Math.PI * 2) / 16 + it.i * 1.7)
      it.stage.style.scale = (1.014 + 0.016 * b).toFixed(4)
      if (!it.sec.classList.contains('hero')) it.stage.style.translate = `${(px * -9).toFixed(2)}px ${(py * -6).toFixed(2)}px`
      moved(it.stage)
    }
  })
}
