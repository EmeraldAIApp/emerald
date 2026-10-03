// S5 · roadmap: the loan Submit (testnet) answers "Not live yet".
export function mountLoan(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-loan-submit]')
  const reply = document.querySelector<HTMLElement>('[data-loan-reply]')
  if (!btn || !reply) return
  btn.addEventListener('click', () => {
    reply.hidden = false
    btn.disabled = true
  })
}
