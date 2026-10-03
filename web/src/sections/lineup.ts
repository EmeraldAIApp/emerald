// S1 · lineup: copy the CA ([data-copy-ca] buttons in the nav, the giant CA and the footer).
export function mountCopyCa(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-copy-ca]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ca = b.dataset.copyCa ?? ''
      try {
        await navigator.clipboard.writeText(ca)
        b.textContent = 'Copied'
      } catch {
        b.textContent = 'Select it'
      }
      setTimeout(() => (b.textContent = 'Copy'), 1600)
    }),
  )
}
