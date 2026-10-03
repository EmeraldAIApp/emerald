// S0 · nav: mobile menu and the "Check a tx" links ([data-open-emerald]) that lead to the chat input.
export function mountNav(): void {
  const nav = document.querySelector<HTMLElement>('[data-nav]')
  const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]')
  if (!nav || !toggle) return
  const set = (open: boolean) => {
    nav.toggleAttribute('data-open', open)
    toggle.setAttribute('aria-expanded', String(open))
  }
  toggle.addEventListener('click', () => set(!nav.hasAttribute('data-open')))
  nav.querySelectorAll('.nav__links a').forEach((a) => a.addEventListener('click', () => set(false)))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.hasAttribute('data-open')) {
      set(false)
      toggle.focus()
    }
  })
}

export function mountOpenEmerald(input: HTMLTextAreaElement): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-open-emerald]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault()
      input.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
      input.focus({ preventScroll: true })
    }),
  )
}
