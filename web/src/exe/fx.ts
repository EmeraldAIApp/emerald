// / (Emerald.exe) details: boot screen, typed verdict, rolling counters, roadmap bars, live clock, wallpaper parallax, Start menu.
import { setSound, sfx, soundOn } from './sound.js'

const calm = matchMedia('(prefers-reduced-motion: reduce)')
const root = document.documentElement

/** First-visit boot (<= 1.4 s, any click/key skips). Resolves when the desktop is visible. */
export function boot(): Promise<void> {
  if (!root.classList.contains('is-booting')) return Promise.resolve()
  const el = document.querySelector<HTMLElement>('.boot')
  return new Promise((done) => {
    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      removeEventListener('pointerdown', finish, true)
      removeEventListener('keydown', finish, true)
      try {
        localStorage.setItem('emerald.exe.booted', '1')
      } catch {
        /* ignore */
      }
      el?.classList.add('is-out')
      // the boot screen collapses like a CRT switching channel (exe.css), then leaves the DOM
      setTimeout(() => {
        root.classList.remove('is-booting')
        el?.remove()
      }, 430)
      done()
    }
    // the whole boot stays under 1.5 s from navigation, however long the script took to arrive
    const timer = setTimeout(finish, Math.max(300, 1250 - performance.now()))
    addEventListener('pointerdown', finish, true)
    addEventListener('keydown', finish, true)
  })
}

/** The verdict headline types itself out (the full text stays in the live region for screen readers). */
export function typeVerdict(screen: HTMLElement): void {
  if (calm.matches) return
  const td = screen.querySelector<HTMLElement>('.dv__verdict td')
  const node = td?.lastChild
  if (!td || !node || node.nodeType !== Node.TEXT_NODE) return
  const full = node.textContent ?? ''
  td.classList.add('is-typing')
  let i = 0
  node.textContent = ''
  const step = (): void => {
    if (!node.isConnected) return
    i = Math.min(full.length, i + 1)
    node.textContent = full.slice(0, i)
    if (i < full.length) setTimeout(step, 34 + Math.random() * 30)
    else setTimeout(() => td.classList.remove('is-typing'), 700)
  }
  setTimeout(step, 90)
}

/** Numbers in the token counter roll to their new value instead of jumping. */
export function rollNumbers(els: HTMLElement[]): void {
  for (const el of els) {
    let shown = el.textContent ?? '0'
    let raf = 0
    new MutationObserver(() => {
      const next = el.textContent ?? ''
      if (next === shown) return
      const to = Number.parseFloat(next.replace(/[^0-9.]/g, ''))
      const from = Number.parseFloat(shown.replace(/[^0-9.]/g, '')) || 0
      if (!Number.isFinite(to) || calm.matches) {
        shown = next
        return
      }
      const dec = (next.split('.')[1] ?? '').replace(/\D.*/, '').length
      const fmt = (v: number): string => next.replace(/[0-9][0-9,]*(\.[0-9]+)?/, v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }))
      cancelAnimationFrame(raf)
      const t0 = performance.now()
      const tick = (t: number): void => {
        const k = Math.min(1, (t - t0) / 900)
        const e = 1 - (1 - k) ** 3
        shown = fmt(from + (to - from) * e)
        el.textContent = shown
        if (k < 1) raf = requestAnimationFrame(tick)
        else el.textContent = shown = next
      }
      shown = fmt(from)
      el.textContent = shown
      raf = requestAnimationFrame(tick)
      el.closest('.lcd')?.classList.add('is-rolling')
      setTimeout(() => el.closest('.lcd')?.classList.remove('is-rolling'), 950)
    }).observe(el, { childList: true, characterData: true, subtree: true })
  }
}

/** Adds .is-in once an element scrolls into view (roadmap bars fill, token LCDs light up). */
export function revealOnView(els: Element[]): void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        e.target.classList.add('is-in')
        io.unobserve(e.target)
      }
    },
    { threshold: 0.35 },
  )
  els.forEach((el) => io.observe(el))
}

/** Taskbar clock: live, with a blinking colon. */
export function mountClock(clock: HTMLTimeElement | null): void {
  if (!clock) return
  let last = ''
  const tick = (): void => {
    const d = new Date()
    const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).formatToParts(d)
    const key = parts.map((p) => p.value).join('')
    if (key !== last) {
      last = key
      clock.innerHTML = parts.map((p) => (p.type === 'literal' && p.value === ':' ? '<span class="colon">:</span>' : p.value)).join('')
      clock.dateTime = d.toISOString()
    }
  }
  tick()
  setInterval(tick, 1000)
}

/** Moon, ETH diamond and sparkles drift a little against the mouse. */
export function mountParallax(wall: HTMLElement | null): void {
  if (!wall || calm.matches || !matchMedia('(pointer: fine)').matches) return
  let tx = 0
  let ty = 0
  let x = 0
  let y = 0
  let raf = 0
  const loop = (): void => {
    x += (tx - x) * 0.08
    y += (ty - y) * 0.08
    wall.style.setProperty('--px', x.toFixed(4))
    wall.style.setProperty('--py', y.toFixed(4))
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(loop) : 0
  }
  addEventListener(
    'pointermove',
    (e) => {
      tx = e.clientX / innerWidth - 0.5
      ty = e.clientY / innerHeight - 0.5
      if (!raf) raf = requestAnimationFrame(loop)
    },
    { passive: true },
  )
}

/** Start button opens a menu with every window; the tray speaker toggles sounds. */
export function mountStart(list: { id: string; title: string; icon: string }[], open: (id: string, from?: DOMRect) => void): void {
  const btn = document.querySelector<HTMLAnchorElement>('[data-start]')
  const menu = document.querySelector<HTMLElement>('[data-start-menu]')
  const ul = document.querySelector<HTMLElement>('[data-start-list]')
  if (!btn || !menu || !ul) return
  btn.setAttribute('role', 'button')
  btn.setAttribute('aria-expanded', 'false')
  for (const w of list) {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'start__item'
    b.innerHTML = `${w.icon}<span>${w.title.replace(/[&<>]/g, '')}</span>`
    b.addEventListener('click', () => {
      toggle(false)
      open(w.id, btn.getBoundingClientRect())
    })
    li.append(b)
    ul.append(li)
  }
  const classic = document.querySelector<HTMLAnchorElement>('.icons a[href="/classic/"]')
  if (classic) {
    const li = document.createElement('li')
    li.className = 'start__sep'
    const a = document.createElement('a')
    a.className = 'start__item'
    a.href = classic.href
    a.innerHTML = classic.innerHTML
    li.append(a)
    ul.append(li)
  }
  const toggle = (show: boolean = menu.hidden === true): void => {
    menu.hidden = !show
    btn.setAttribute('aria-expanded', String(show))
    btn.classList.toggle('is-down', show)
    if (show) {
      sfx('click')
      menu.querySelector<HTMLElement>('.start__item')?.focus()
    }
  }
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    toggle()
  })
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && !btn.contains(e.target as Node)) toggle(false)
  })
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll<HTMLElement>('.start__item')]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      toggle(false)
      btn.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    }
  })

  const sound = document.querySelector<HTMLButtonElement>('[data-sound]')
  if (sound && 'AudioContext' in window) {
    sound.hidden = false
    const paint = (): void => sound.setAttribute('aria-pressed', String(soundOn()))
    paint()
    sound.addEventListener('click', () => {
      setSound(!soundOn())
      paint()
    })
  }
}

/** Rubber-band selection on the bare desktop, like a real OS: a dotted rectangle that selects the icons it touches. */
export function mountLasso(): void {
  const wide = matchMedia('(min-width: 900px) and (pointer: fine)')
  const icons = [...document.querySelectorAll<HTMLElement>('.icons .icon')]
  let box: HTMLElement | undefined
  let from: { x: number; y: number; id: number } | undefined
  let raf = 0
  let to = { x: 0, y: 0 }
  const blocked = '.win, a, button, input, textarea, select, label, .taskbar, .start, .foot, .hero h1, .dateline, .saver'
  const clear = (): void => icons.forEach((i) => i.classList.remove('is-selected'))

  const paint = (): void => {
    raf = 0
    if (!from || !box) return
    const l = Math.min(from.x, to.x)
    const t = Math.min(from.y, to.y)
    const w = Math.abs(to.x - from.x)
    const h = Math.abs(to.y - from.y)
    box.style.transform = `translate(${l}px, ${t}px)`
    box.style.width = `${w}px`
    box.style.height = `${h}px`
    for (const i of icons) {
      const r = i.getBoundingClientRect()
      const hit = r.right > l && r.left < l + w && r.bottom > t && r.top < t + h
      i.classList.toggle('is-selected', hit)
    }
  }

  addEventListener('pointerdown', (e) => {
    if (!wide.matches || e.button !== 0 || e.pointerType === 'touch') return
    const target = e.target as Element
    if (target.closest(blocked)) {
      if (!target.closest('.icons')) clear()
      return
    }
    clear()
    e.preventDefault() // no text selection while the band is out
    from = { x: e.clientX, y: e.clientY, id: e.pointerId }
    to = { x: e.clientX, y: e.clientY }
    box ??= Object.assign(document.createElement('div'), { className: 'lasso' })
    box.setAttribute('aria-hidden', 'true')
    box.style.width = box.style.height = '0px'
    document.body.append(box)
  })
  addEventListener(
    'pointermove',
    (e) => {
      if (!from || e.pointerId !== from.id) return
      to = { x: e.clientX, y: e.clientY }
      if (!raf) raf = requestAnimationFrame(paint)
    },
    { passive: true },
  )
  const end = (e: PointerEvent): void => {
    if (!from || e.pointerId !== from.id) return
    from = undefined
    cancelAnimationFrame(raf)
    raf = 0
    box?.remove()
  }
  addEventListener('pointerup', end)
  addEventListener('pointercancel', end)
  addEventListener('keydown', (e) => e.key === 'Escape' && clear())
}
