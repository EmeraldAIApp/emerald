// / (Emerald.exe) window manager: focus/z-order, drag by the title bar, minimize to the taskbar, close and reopen.
// Desktop (>= 900 px) is a real desktop; phones keep the stacked column and only collapse/expand window bodies.
import { sfx } from './sound.js'

type State = 'open' | 'min' | 'closed'
interface Win {
  id: string
  el: HTMLElement
  bar: HTMLElement
  title: string
  icon: string
  state: State
  dx: number
  dy: number
  task?: HTMLButtonElement
}

const desktop = matchMedia('(min-width: 900px)')
const calm = matchMedia('(prefers-reduced-motion: reduce)')
const EASE_POP = 'cubic-bezier(.2, .9, .25, 1.15)'
const EASE_OUT = 'cubic-bezier(.4, 0, .7, .2)'

export function mountWindows() {
  const wins = new Map<string, Win>()
  const order: string[] = [] // back -> front
  const tasks = document.querySelector<HTMLElement>('[data-tasks]')
  let active: string | undefined

  for (const el of document.querySelectorAll<HTMLElement>('.desk > .win')) {
    const bar = el.querySelector<HTMLElement>('.win__bar')!
    const w: Win = {
      id: el.id,
      el,
      bar,
      title: el.querySelector('.win__title')?.textContent?.trim() ?? el.id,
      icon: el.querySelector('.win__ico')?.outerHTML ?? '',
      state: 'open',
      dx: 0,
      dy: 0,
    }
    wins.set(w.id, w)
    order.push(w.id)
    el.dataset.state = 'open'
    wire(w)
  }

  // ---------- z-order and focus
  function restack(): void {
    order.forEach((id, i) => (wins.get(id)!.el.style.zIndex = String(3 + i)))
  }
  function focus(id: string, moveFocus = false, raise = true): void {
    const w = wins.get(id)
    if (!w || w.state !== 'open') return
    if (active !== id) {
      if (raise) {
        order.splice(order.indexOf(id), 1)
        order.push(id)
        restack()
      }
      active = id
      for (const o of wins.values()) {
        o.el.toggleAttribute('data-active', o.id === id)
        o.task?.setAttribute('aria-pressed', String(o.id === id))
      }
    }
    if (moveFocus && !w.el.contains(document.activeElement)) w.el.focus({ preventScroll: true })
  }
  function focusTopmost(): void {
    for (let i = order.length - 1; i >= 0; i--) {
      const w = wins.get(order[i]!)!
      if (w.state === 'open') return focus(w.id)
    }
    active = undefined
    for (const o of wins.values()) o.el.removeAttribute('data-active')
  }

  // ---------- taskbar buttons (desktop only, by CSS)
  function syncTask(w: Win): void {
    if (!tasks) return
    if (w.state === 'closed') {
      w.task?.remove()
      w.task = undefined
      return
    }
    if (!w.task) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'task'
      b.innerHTML = `${w.icon}<span>${w.title.replace(/[&<>]/g, '')}</span>`
      b.setAttribute('aria-label', w.title)
      b.addEventListener('click', () => {
        if (w.state === 'min') open(w.id, { from: b.getBoundingClientRect() })
        else if (active === w.id) minimize(w.id)
        else focus(w.id, true)
      })
      // keep the taskbar in page order
      const after = [...wins.values()].slice([...wins.keys()].indexOf(w.id) + 1).find((o) => o.task)?.task
      tasks.insertBefore(b, after ?? null)
      w.task = b
    }
    w.task.dataset.state = w.state
    w.task.setAttribute('aria-pressed', String(active === w.id && w.state === 'open'))
  }

  function setState(w: Win, s: State): void {
    w.state = s
    w.el.dataset.state = s
    w.el.querySelector('[data-min]')?.setAttribute('aria-expanded', String(s === 'open'))
    syncTask(w)
  }

  // ---------- animations
  /** Classic-Mac zoom outline between two rects (the window "flies" from its icon or task button). */
  function zoomRect(from: DOMRect, to: DOMRect, reverse = false): void {
    if (calm.matches || !desktop.matches) return
    const z = document.createElement('div')
    z.className = 'zoomrect'
    Object.assign(z.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` })
    document.body.append(z)
    const sx = from.width / to.width
    const sy = from.height / to.height
    const a = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`
    const frames = [{ transform: a, opacity: 0.9 }, { transform: 'none', opacity: 0.35 }]
    z.animate(reverse ? frames.reverse() : frames, { duration: 240, easing: 'cubic-bezier(.3,.6,.2,1)' }).finished.finally(() => z.remove())
  }

  function popIn(el: HTMLElement, delay = 0): Animation | undefined {
    if (calm.matches) return
    return el.animate(
      [
        { opacity: 0, scale: '.9', filter: 'brightness(1.25)' },
        { opacity: 1, scale: '1.018', filter: 'brightness(1.05)', offset: 0.62 },
        { opacity: 1, scale: '1', filter: 'none' },
      ],
      { duration: 460, delay, easing: EASE_POP, fill: 'backwards' },
    )
  }

  /** Display scaling of the desktop on big monitors (exe.css): rects are in screen px, styles in unzoomed px. */
  const ui = (): number => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1

  /** Desktop minimize/restore: the window itself flies into (or out of) its taskbar button. */
  function fly(w: Win, task: DOMRect, out: boolean): Promise<void> {
    if (calm.matches) return Promise.resolve()
    const r = w.el.getBoundingClientRect()
    const dx = (task.left + task.width / 2 - (r.left + r.width / 2)) / ui()
    const dy = (task.top + task.height / 2 - (r.top + r.height / 2)) / ui()
    const away = { transform: `translate(${dx}px, ${dy}px) scale(${Math.max(0.06, task.width / r.width)}, ${Math.max(0.03, task.height / r.height)})`, opacity: 0.2, filter: 'brightness(1.4)' }
    const home = { transform: 'none', opacity: 1, filter: 'none' }
    const a = w.el.animate(out ? [home, away] : [away, home], {
      duration: out ? 300 : 380,
      easing: out ? 'cubic-bezier(.55,0,.75,.35)' : 'cubic-bezier(.2,.9,.25,1.08)',
    })
    return a.finished.then(
      () => {},
      () => {},
    )
  }

  /** Phones: the body folds up/down under its title bar. `done` runs on the last frame, before the fill is dropped. */
  function collapseBody(w: Win, collapse: boolean, done?: () => void): Promise<void> {
    const body = w.el.querySelector<HTMLElement>('.win__body')
    if (!body || calm.matches) {
      done?.()
      return Promise.resolve()
    }
    const h = body.scrollHeight
    body.style.overflow = 'hidden'
    const frames = [
      { height: `${h}px`, opacity: 1 },
      { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px' },
    ]
    const a = body.animate(collapse ? frames : frames.reverse(), { duration: 280, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' })
    const finish = (): void => {
      done?.()
      a.cancel()
      body.style.overflow = ''
    }
    return a.finished.then(finish, finish)
  }

  // ---------- actions
  function open(id: string, opts: { from?: DOMRect; scroll?: boolean } = {}): void {
    const w = wins.get(id)
    if (!w) return
    const wasOpen = w.state === 'open'
    const wasMin = w.state === 'min'
    if (!desktop.matches) {
      if (!wasOpen) {
        setState(w, 'open')
        void collapseBody(w, false)
        sfx('open')
      }
      w.el.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' })
      w.el.focus({ preventScroll: true })
      return
    }
    setState(w, 'open')
    focus(id, true)
    const r = w.el.getBoundingClientRect()
    const offscreen = r.top < 0 || r.bottom > innerHeight - 56
    if (opts.scroll !== false && offscreen) {
      w.el.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: r.height > innerHeight - 120 ? 'start' : 'center' })
    }
    if (!wasOpen) {
      if (wasMin && w.task && !offscreen) void fly(w, w.task.getBoundingClientRect(), false)
      else {
        if (opts.from && !offscreen) zoomRect(opts.from, r)
        popIn(w.el)
      }
      sfx('open')
    } else if (!calm.matches) {
      // already open: a small "here I am" nudge
      w.el.animate([{ scale: '1' }, { scale: '1.012' }, { scale: '1' }], { duration: 260, easing: 'ease-out' })
    }
  }

  async function minimize(id: string): Promise<void> {
    const w = wins.get(id)
    if (!w || w.state !== 'open') return
    sfx('close')
    if (!desktop.matches) return collapseBody(w, true, () => setState(w, 'min'))
    setState(w, 'min') // creates/updates the task button first so the outline has a target
    w.el.dataset.state = 'open' // keep visible while it shrinks
    if (!calm.matches) {
      if (w.task) await fly(w, w.task.getBoundingClientRect(), true)
      else await w.el.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.86' }], { duration: 200, easing: EASE_OUT }).finished.catch(() => {})
    }
    if ((w.state as State) === 'min') w.el.dataset.state = 'min'
    if (active === id) focusTopmost()
    if (w.el.contains(document.activeElement)) w.task?.focus()
  }

  async function close(id: string): Promise<void> {
    const w = wins.get(id)
    if (!w || w.state === 'closed') return
    sfx('close')
    if (!desktop.matches) return collapseBody(w, true, () => setState(w, 'min'))
    const hadFocus = w.el.contains(document.activeElement)
    if (!calm.matches && w.state === 'open') {
      await w.el.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.94' }], { duration: 180, easing: EASE_OUT }).finished.catch(() => {})
    }
    setState(w, 'closed')
    if (active === id) focusTopmost()
    if (hadFocus) (document.querySelector<HTMLElement>(`[data-open="${id}"]`) ?? document.querySelector<HTMLElement>('[data-start]'))?.focus()
  }

  // ---------- per-window wiring
  function wire(w: Win): void {
    w.el.addEventListener('pointerdown', () => focus(w.id), true)
    w.el.addEventListener('focusin', () => focus(w.id))
    w.el.querySelector('[data-min]')?.addEventListener('click', () => {
      if (!desktop.matches && w.state !== 'open') return open(w.id)
      void minimize(w.id)
    })
    w.el.querySelector('[data-close]')?.addEventListener('click', () => {
      if (!desktop.matches && w.state !== 'open') return open(w.id)
      void close(w.id)
    })

    // Drag by the title bar: mouse/pen on desktop only. `translate` keeps the grid slot (no layout shift).
    // The window lifts (scale + deeper shadow, CSS), leans with the horizontal speed and glides on release.
    let dragging = false
    let bounds = { x: 0, y: 0, dx: 0, dy: 0, left: 0, top: 0, width: 0 }
    let raf = 0
    let prev = 0
    let vx = 0 // px/ms, smoothed
    let vy = 0
    let lastMove = { x: 0, y: 0, t: 0 }
    let tilt = 0
    let gliding = false
    const clampX = (dx: number): number =>
      // keep at least 120 px of the title bar on screen
      Math.min(Math.max(dx, 120 - bounds.width - bounds.left), document.documentElement.clientWidth - 120 - bounds.left)
    const clampY = (dy: number): number => Math.max(dy, 8 - bounds.top) // never above the page top
    const paint = (): void => {
      // w.dx/w.dy are screen px (pointer deltas); the window lives inside the zoomed desk
      const z = ui()
      w.el.style.translate = `${(w.dx / z).toFixed(1)}px ${(w.dy / z).toFixed(1)}px`
      w.el.style.rotate = Math.abs(tilt) < 0.01 ? '' : `${tilt.toFixed(3)}deg`
    }
    const tick = (now: number): void => {
      raf = 0
      const dt = Math.min(32, now - prev || 16)
      prev = now
      if (gliding) {
        const nx = w.dx + vx * dt
        const ny = w.dy + vy * dt
        w.dx = clampX(nx)
        w.dy = clampY(ny)
        // a bound stops that axis softly (no bounce)
        if (w.dx !== nx) vx = 0
        if (w.dy !== ny) vy = 0
        const fr = Math.pow(0.9, dt / 16)
        vx *= fr
        vy *= fr
        gliding = Math.hypot(vx, vy) > 0.012
      }
      // lean into the motion, settle when it stops
      const target = dragging || gliding ? Math.max(-2.4, Math.min(2.4, vx * 1.6)) : 0
      tilt += (target - tilt) * (1 - Math.pow(0.8, dt / 16))
      if (!dragging && !gliding && Math.abs(tilt) < 0.01) tilt = 0
      paint()
      if (dragging || gliding || tilt !== 0) raf = requestAnimationFrame(tick)
    }
    const loop = (): void => {
      if (raf) return
      prev = performance.now()
      raf = requestAnimationFrame(tick)
    }
    w.bar.addEventListener('pointerdown', (e) => {
      if (!desktop.matches || e.button !== 0 || e.pointerType === 'touch') return
      if ((e.target as Element).closest('button, a, input, textarea')) return
      e.preventDefault()
      gliding = false
      vx = vy = 0
      const r = w.el.getBoundingClientRect()
      bounds = { x: e.clientX, y: e.clientY, dx: w.dx, dy: w.dy, left: r.left - w.dx, top: r.top + scrollY - w.dy, width: r.width }
      lastMove = { x: e.clientX, y: e.clientY, t: performance.now() }
      dragging = true
      w.bar.setPointerCapture(e.pointerId)
      w.el.classList.add('is-dragging')
      loop()
    })
    w.bar.addEventListener('pointermove', (e) => {
      if (!dragging) return
      w.dx = clampX(bounds.dx + e.clientX - bounds.x)
      w.dy = clampY(bounds.dy + e.clientY - bounds.y)
      const now = performance.now()
      const dt = Math.max(1, now - lastMove.t)
      vx = vx * 0.6 + ((e.clientX - lastMove.x) / dt) * 0.4
      vy = vy * 0.6 + ((e.clientY - lastMove.y) / dt) * 0.4
      lastMove = { x: e.clientX, y: e.clientY, t: now }
      if (calm.matches) vx = vy = 0
      loop()
    })
    const end = (): void => {
      if (!dragging) return
      dragging = false
      w.el.classList.remove('is-dragging')
      // a release after a pause does not glide
      if (calm.matches || performance.now() - lastMove.t > 80) vx = vy = 0
      gliding = Math.hypot(vx, vy) > 0.15
      loop()
    }
    w.bar.addEventListener('pointerup', end)
    w.bar.addEventListener('pointercancel', end)
    // double-click the title bar: back to its place
    w.bar.addEventListener('dblclick', (e) => {
      if (!desktop.matches || (e.target as Element).closest('button')) return
      gliding = false
      vx = vy = 0
      const from = w.el.style.translate || '0px 0px'
      w.dx = w.dy = 0
      paint()
      if (!calm.matches) w.el.animate([{ translate: from }, { translate: '0px 0px' }], { duration: 360, easing: EASE_POP })
    })
  }

  // ---------- desktop icons and keyboard
  document.querySelectorAll<HTMLAnchorElement>('[data-open]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault()
      open(a.dataset.open!, { from: a.querySelector('svg')?.getBoundingClientRect() })
    }),
  )
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    const t = e.target as HTMLElement
    if (t.matches('input, textarea, select') && (t as HTMLInputElement).value) return // Esc in a filled field is not "close"
    const w = t.closest<HTMLElement>('.desk > .win')
    if (w) {
      e.preventDefault()
      void close(w.id)
    }
  })

  // leaving the desktop layout: windows go back to the column, nothing stays hidden
  desktop.addEventListener('change', () => {
    for (const w of wins.values()) {
      w.dx = w.dy = 0
      w.el.style.translate = ''
      w.el.style.rotate = ''
      if (w.state === 'closed' && !desktop.matches) setState(w, 'min')
    }
  })

  // first paint keeps the designed overlaps (CSS z-index), with the checker as the active window
  order.sort((a, b) => (Number(getComputedStyle(wins.get(a)!.el).zIndex) || 0) - (Number(getComputedStyle(wins.get(b)!.el).zIndex) || 0))
  restack()
  focus('try', false, false)
  for (const w of wins.values()) syncTask(w)

  return {
    open,
    list: () => [...wins.values()].map((w) => ({ id: w.id, title: w.title, icon: w.icon })),
    /** Staggered first appearance of every window (after the boot screen). */
    intro(): void {
      let i = 0
      for (const id of [...wins.keys()]) popIn(wins.get(id)!.el, 120 + i++ * 70)
    },
  }
}
