// Page wiring shared by both landings (/ = Emerald.exe and /classic/): quota line + SIWE, the compute counter and the narrow placeholder.
import { computeView, fetchCompute, fetchQuota } from './api.js'
import { quotaLine } from './chat/format.js'

/** Quota line under the chat, plus Sign-In with Ethereum (only offered once the token exists). */
export function createQuota(quotaEl: HTMLElement, onSignedIn: () => void) {
  let session: string | undefined
  async function refresh(prefix = ''): Promise<void> {
    const q = await fetchQuota()
    quotaEl.textContent = q ? `${prefix}${quotaLine(q)}` : prefix
  }
  function signIn(): void {
    quotaEl.textContent = 'Waiting for your wallet…'
    // viem + SIWE load only when login is requested: they add no weight to the first load.
    import('./auth/siwe.js')
      .then(({ signIn, injectedProvider }) => signIn(injectedProvider(), { host: location.host, origin: location.origin }))
      .then((r) => {
        session = r.address
        onSignedIn()
        return refresh(`Signed in as ${r.address.slice(0, 6)}…${r.address.slice(-4)}. `)
      })
      .catch((e: unknown) => {
        const reason = (e as { reason?: string } | null)?.reason ?? 'verify'
        quotaEl.textContent =
          reason === 'no_wallet' ? 'No wallet found in this browser.' : reason === 'rejected' ? 'Sign-in cancelled.' : 'Sign-in failed. Try again.'
      })
  }
  return { refresh, signIn, address: () => session }
}

/** Live counter ([data-compute]): polls /api/compute every minute while it is on screen. */
export function mountCompute(computeEl: HTMLElement | null): () => Promise<void> {
  async function refresh(): Promise<void> {
    const c = await fetchCompute()
    if (!c || !computeEl) return
    const view = computeView(c)
    computeEl.querySelector('[data-compute-paid]')!.textContent = view.paid
    computeEl.querySelector('[data-compute-claimable]')!.textContent = view.claimable
    computeEl.querySelector('[data-compute-spend]')!.textContent = view.spend
    computeEl.querySelector('[data-compute-checks]')!.textContent = view.checks
  }
  if (computeEl) {
    let timer: ReturnType<typeof setInterval> | undefined
    new IntersectionObserver(([e]) => {
      clearInterval(timer)
      if (e?.isIntersecting) {
        void refresh()
        timer = setInterval(() => void refresh(), 60_000)
      }
    }).observe(computeEl)
  }
  return refresh
}

/** Phones get the short placeholder (data-placeholder-narrow). */
export function fitPlaceholder(input: HTMLTextAreaElement): void {
  const wide = input.placeholder
  const narrow = matchMedia('(max-width: 767px)')
  const fit = (): void => {
    input.placeholder = narrow.matches ? (input.dataset.placeholderNarrow ?? wide) : wide
  }
  narrow.addEventListener('change', fit)
  fit()
}
