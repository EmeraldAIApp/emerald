// Small premium details: the loader hand-off, light that follows the pointer on buttons and chips, film grain.

/** Lifts the loader once the hero photo is decoded and the fonts are in (never before 450 ms, never after 1.6 s). */
export function liftLoader(onLift: () => void): void {
  const loader = document.querySelector<HTMLElement>('[data-loader]')
  const stage = document.querySelector<HTMLElement>('.hero [data-stage]')
  let done = false
  const lift = () => {
    if (done) return
    done = true
    document.documentElement.classList.add('is-loaded')
    onLift()
    setTimeout(() => loader?.remove(), 1200)
  }
  if (!loader || getComputedStyle(loader).display === 'none') return lift()
  const t0 = performance.now()
  const ready = new Promise<void>((resolve) => {
    if (!stage || stage.classList.contains('is-ready')) return resolve()
    new MutationObserver((_, mo) => {
      if (stage.classList.contains('is-ready')) {
        mo.disconnect()
        resolve()
      }
    }).observe(stage, { attributes: true, attributeFilter: ['class'] })
  })
  void Promise.all([ready, document.fonts?.ready]).then(() => setTimeout(lift, Math.max(0, 450 - (performance.now() - t0))))
  setTimeout(lift, 1600)
}

/** Buttons and chips catch a soft light where the pointer is (--hx/--hy, read by motion.css). */
export function mountHoverLight(): void {
  addEventListener(
    'pointermove',
    (e) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('.dv__btn, .dv__chip, .nav__chip')
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--hx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`)
      el.style.setProperty('--hy', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`)
    },
    { passive: true },
  )
}

/** Fine film grain over the whole page; it only shimmers on the rich tier (motion.css animates .fx-grain.is-live). */
export function mountGrain(live: boolean): void {
  const g = document.createElement('div')
  g.className = live ? 'fx-grain is-live' : 'fx-grain'
  g.setAttribute('aria-hidden', 'true')
  document.body.append(g)
}
