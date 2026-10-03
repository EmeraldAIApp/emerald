// Motion pass (page-design phase 4): the verdict light wave, the reveals and the chat micro-motion.
// Everything here is WAAPI on purpose: document.getAnimations().finish() settles it (capture.py, e2e), and nothing
// waits hidden for a scroll that never comes. Everything respects reduced-motion and ?static.
import { LIGHT, setLightInstant, type LightLevel } from './light/light.js'

export const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const still = () => reduce() || new URLSearchParams(location.search).has('static')
const running = new WeakMap<HTMLElement, Animation>()
const current = new WeakMap<HTMLElement, LightLevel>()
/** Expo-out: fast start, long soft landing (the "cinema" ease of the whole page). */
export const EXPO = 'cubic-bezier(.16,1,.3,1)'

/** 80 ms screen refresh, then the new light spreads out from the bracelet in ~700 ms (brief §7). */
export async function setLight(stage: HTMLElement, level: LightLevel, screens: HTMLElement[] = []): Promise<void> {
  // main.ts starts every stage at idle with setLightInstant: without the `?? 'idle'`, the mirror() on load ran an
  // idle -> idle wave and a screen refresh with no verdict (seen in Chromium). The wow only answers the input.
  if ((current.get(stage) ?? 'idle') === level) return
  current.set(stage, level)
  running.get(stage)?.cancel()
  if (reduce() || !stage.classList.contains('has-light')) return setLightInstant(stage, level)
  const L = LIGHT[level]
  stage.style.setProperty('--c-next', L.c)
  stage.style.setProperty('--mul-next', String(L.mul))
  stage.style.setProperty('--glow-next', String(L.glow))
  for (const el of screens) {
    el.classList.remove('is-refresh')
    void el.offsetWidth
    el.classList.add('is-refresh')
  }
  await new Promise((r) => setTimeout(r, 80))
  if (current.get(stage) !== level) return
  const anim = stage.animate([{ '--r': '0%' }, { '--r': '114%' }], { duration: 700, easing: 'cubic-bezier(.3,.6,.35,1)', fill: 'forwards' })
  running.set(stage, anim)
  try {
    await anim.finished
  } catch {
    return // another verdict cut it short
  }
  setLightInstant(stage, level) // the new light becomes "prev" and --r goes back to 0 in the same frame: no flicker
  anim.cancel()
  running.delete(stage)
}

// ---------------------------------------------------------------- headline split (masked words, revealed by line)

/** Wraps each word of a headline in a clipping mask (.w > .w__in). The text content is unchanged (spaces kept). */
export function splitWords(h: HTMLElement): HTMLElement[] {
  if (h.dataset.split) return [...h.querySelectorAll<HTMLElement>('.w__in')]
  h.dataset.split = '1'
  const walk = (node: Node): void => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = (child.textContent ?? '').split(/(\s+)/)
        const frag = document.createDocumentFragment()
        for (const part of parts) {
          if (!part) continue
          if (/^\s+$/.test(part)) frag.append(document.createTextNode(part))
          else {
            const w = document.createElement('span')
            w.className = 'w'
            const inner = document.createElement('span')
            inner.className = 'w__in'
            inner.textContent = part
            w.append(inner)
            frag.append(w)
          }
        }
        child.replaceWith(frag)
      } else if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName !== 'BR') walk(child)
    }
  }
  walk(h)
  return [...h.querySelectorAll<HTMLElement>('.w__in')]
}

/** Masked line reveal: each word rises out of its own clip, line by line (grouped by their real offsetTop). */
export function revealHeadline(h: HTMLElement, delay = 0): void {
  const words = splitWords(h)
  const tops = [...new Set(words.map((w) => (w.parentElement as HTMLElement).offsetTop))].sort((a, b) => a - b)
  words.forEach((w, i) => {
    const line = tops.indexOf((w.parentElement as HTMLElement).offsetTop)
    w.animate(
      [
        { translate: '0 108%', rotate: '3deg', opacity: 0.2 },
        { translate: '0 0', rotate: '0deg', opacity: 1 },
      ],
      { duration: 1150, delay: delay + line * 110 + i * 14, easing: EXPO, fill: 'backwards' },
    )
  })
}

/** Soft rise for copy blocks. */
export function rise(el: HTMLElement, delay = 0, dist = 22): Animation {
  return el.animate(
    [
      { opacity: 0, translate: `0 ${dist}px` },
      { opacity: 1, translate: '0 0' },
    ],
    { duration: 1000, delay, easing: EXPO, fill: 'backwards' },
  )
}

/** Device-view panels come in with depth: tilted back, lower, slightly out of focus, then they land. */
export function land(el: HTMLElement, delay = 0, rich = true): Animation {
  const from: Keyframe = rich
    ? { opacity: 0, translate: '0 56px', rotate: 'x 9deg', scale: '.965', filter: 'blur(6px) brightness(1.6)' }
    : { opacity: 0, translate: '0 28px', scale: '.98' }
  const to: Keyframe = rich ? { opacity: 1, translate: '0 0', rotate: 'x 0deg', scale: '1', filter: 'blur(0) brightness(1)' } : { opacity: 1, translate: '0 0', scale: '1' }
  return el.animate([from, to], { duration: rich ? 1300 : 900, delay, easing: EXPO, fill: 'backwards' })
}

const PANELS = '.dv, .page'

/** One section's entrance: headlines by line, copy rises, panels land with depth, lists stagger. */
function enter(el: HTMLElement, rich: boolean): void {
  if (el.matches('h1, h2')) return revealHeadline(el)
  if (el.matches(PANELS)) {
    land(el, 120, rich)
    return
  }
  const h = el.querySelector<HTMLElement>('h1, h2')
  if (h) revealHeadline(h, 60)
  // Children instead of the block: the headline mask reads better without a parent fade over it.
  let d = h ? 220 : 0
  for (const child of el.children as HTMLCollectionOf<HTMLElement>) {
    if (child === h || child.contains(h)) continue
    if (child.matches(PANELS)) land(child, d + 80, rich)
    else if (child.matches('ol, ul')) {
      for (const li of child.children as HTMLCollectionOf<HTMLElement>) {
        rise(li, d, 18)
        d += 90
      }
    } else {
      const inner = child.querySelector<HTMLElement>(PANELS)
      rise(child, d)
      if (inner) land(inner, d + 140, rich)
    }
    d += 90
  }
}

/** Screenshot-safe reveals: everything visible by default; only what enters AFTER load is animated. */
export function reveals(selector = 'main .sec:not(.hero) .sec__in > *', rich = true): void {
  if (still()) return
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue
        io.unobserve(en.target)
        enter(en.target as HTMLElement, rich)
      }
    },
    // Fires a little BEFORE the element shows up, so its first frame on screen is already the animated one.
    { rootMargin: '0px 0px 12% 0px' },
  )
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.getBoundingClientRect().top > innerHeight) io.observe(el)
  }
}

/** The hero entrance after the loader: dateline, headline by line, copy, then the panel lands. */
export function heroIntro(rich: boolean): void {
  if (still()) return
  const q = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)
  const bg = q('.hero .sec__bg')
  bg?.animate(
    [
      { opacity: 0, scale: '1.07' },
      { opacity: 1, scale: '1' },
    ],
    { duration: 2200, easing: EXPO, fill: 'backwards' },
  )
  const dl = q('.hero .dateline')
  if (dl) rise(dl, 150, 12)
  const h1 = q('#hero-h1')
  if (h1) revealHeadline(h1, 260)
  const sub = q('.hero .sub')
  if (sub) rise(sub, 620)
  const trust = q('.hero .trust')
  if (trust) rise(trust, 720)
  const panel = q('.hero__panel')
  if (panel) land(panel, 520, rich)
  const nav = q('.nav')
  nav?.animate([{ opacity: 0, translate: '0 -12px' }, { opacity: 1, translate: '0 0' }], { duration: 1100, delay: 200, easing: EXPO, fill: 'backwards' })
  const loupe = q<HTMLElement>('.hero .loupe')
  loupe?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 1300, easing: 'ease-out', fill: 'backwards' })
}

// ---------------------------------------------------------------- chat micro-motion

/** The verdict headline types itself (visual only: the DOM text is complete from the start, for readers and tests). */
export function typeVerdict(row: HTMLElement | null, perChar = 26): void {
  if (!row || still()) return
  const cell = row.querySelector('td') ?? row
  const text = cell.textContent ?? ''
  if (!text.trim()) return
  // Wrap the text (not the dot) so the clip only hides the letters.
  let span = cell.querySelector<HTMLElement>('.typed')
  if (!span) {
    span = document.createElement('span')
    span.className = 'typed'
    for (const n of [...cell.childNodes]) if (n.nodeType === Node.TEXT_NODE) span.append(n)
    cell.append(span)
  }
  const n = Math.max(1, (span.textContent ?? '').length)
  span.animate([{ clipPath: 'inset(-.2em 100% -.3em 0)' }, { clipPath: 'inset(-.2em 0 -.3em 0)' }], {
    duration: Math.min(900, n * perChar),
    easing: `steps(${n}, end)`,
    fill: 'backwards',
  })
  span.classList.remove('is-typing')
  void span.offsetWidth
  span.classList.add('is-typing')
  setTimeout(() => span?.classList.remove('is-typing'), Math.min(900, n * perChar) + 500)
}

/** A new chat state settles in: its rows come in one after the other instead of popping. */
export function settleRows(screen: HTMLElement | null): void {
  if (!screen || still()) return
  const rows = [...screen.querySelectorAll<HTMLElement>('thead tr, tbody tr')]
  rows.forEach((r, i) =>
    r.animate(
      [
        { opacity: 0, translate: '0 8px' },
        { opacity: 1, translate: '0 0' },
      ],
      { duration: 420, delay: i * 55, easing: EXPO, fill: 'backwards' },
    ),
  )
}
