// "Emerald.exe", the home page (/): the same checker and page wiring as the classic landing, dressed as a retro desktop.
import '../styles/tokens.css'
import './exe.css'
import '../room/room.css'
import { mountChat } from '../chat/controller.js'
import { lightLevel } from '../chat/machine.js'
import { createQuota, fitPlaceholder, mountCompute } from '../page.js'
import { mountCopyCa } from '../sections/lineup.js'
import { mountLoan } from '../sections/roadmap.js'
import { boot, mountClock, mountLasso, mountParallax, mountStart, revealOnView, rollNumbers, typeVerdict } from './fx.js'
import { mountRoom } from '../room/room.js'
import { mountScreensaver } from './screensaver.js'
import { sfx } from './sound.js'
import { gemRain, mountWallpaper } from './wallpaper.js'
import { mountWindows } from './wm.js'

const CA = (import.meta.env.VITE_EMERALD_TOKEN_ADDRESS ?? '').trim()
const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)

mountCopyCa()
mountLoan()

// ---- the desktop: windows, Start menu, clock, wallpaper
const wm = mountWindows()
mountStart(wm.list(), (id, from) => wm.open(id, { from }))
mountClock($<HTMLTimeElement>('[data-clock]'))
// live wallpaper (WebGL on desktop; the CSS one elsewhere, which keeps the mouse parallax)
const wall = mountWallpaper()
if (!document.documentElement.classList.contains('has-gl')) mountParallax($<HTMLElement>('.wall'))
mountLasso()
revealOnView([...document.querySelectorAll('.bars, .counter')])
rollNumbers([...document.querySelectorAll<HTMLElement>('[data-compute-paid], [data-compute-checks]')])
// the room (once per session on desktop) or the first-visit boot card, then the windows come in
void (document.documentElement.classList.contains('is-room') ? mountRoom() : boot()).then(() => {
  if (document.documentElement.classList.contains('intro')) {
    wm.intro()
    document.querySelectorAll<HTMLElement>('.hero, .icon').forEach((el, i) =>
      el.animate([{ opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' }], {
        duration: 520,
        delay: i * 45,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'backwards',
      }),
    )
    document.documentElement.classList.remove('intro')
  }
})

const caChip = $<HTMLElement>('[data-taskbar-ca]')
if (caChip && CA) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = caChip.className
  const label = caChip.textContent ?? ''
  b.textContent = label
  b.setAttribute('aria-label', `Copy contract address ${CA}`)
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(CA)
      b.textContent = 'Copied'
    } catch {
      b.textContent = 'Select it'
    }
    setTimeout(() => (b.textContent = label), 1600)
  })
  caChip.replaceWith(b)
}

// ---- the checker
const quota = createQuota($<HTMLElement>('[data-quota]')!, () => chat.dispatch({ type: 'reset' }))
const refreshCompute = mountCompute($<HTMLElement>('[data-compute]'))
const panel = $<HTMLElement>('.exe-chat')!
const input = $<HTMLTextAreaElement>('#chat-input')!

const chat = mountChat(
  {
    panel,
    screen: $<HTMLTableElement>('[data-screen]')!,
    form: $<HTMLFormElement>('[data-chat-form]')!,
    input,
    submit: $<HTMLButtonElement>('.chat__submit')!,
    chips: $<HTMLElement>('[data-chips]')!,
    announce: $<HTMLElement>('[data-announce]')!,
  },
  {
    canSignIn: CA !== '',
    log: true,
    userAddress: quota.address,
    // The desktop tints with the verdict (body[data-verdict]), like the outline in chapter 6.
    onChange: (s, prev) => {
      document.body.dataset.verdict = lightLevel(s)
      if (s.kind === 'verdict' && prev.kind !== 'verdict') {
        typeVerdict(panel)
        sfx(s.verdict.level === 'red' ? 'alert' : s.verdict.level === 'green' ? 'ok' : 'click')
        // the wallpaper answers the verdict: one red pulse, or a green wave and a short shower of emeralds
        if (s.verdict.level === 'red') wall.wave('red', panel.getBoundingClientRect())
        else if (s.verdict.level === 'green') {
          wall.wave('green', panel.getBoundingClientRect())
          gemRain()
        }
      }
    },
    onSettled: () => {
      void quota.refresh()
      void refreshCompute()
    },
    onSignIn: quota.signIn,
  },
)
document.body.dataset.verdict = lightLevel(chat.state)
void quota.refresh()
fitPlaceholder(input)

// screensaver after 25 s idle (desktop); ?screensaver shows it right away (QA)
mountScreensaver({
  force: /[?&]screensaver(?:[&=#]|$)/.test(location.search),
  busy: () => $<HTMLButtonElement>('.chat__submit')?.disabled === true || document.documentElement.classList.contains('is-room'),
  onShow: () => wall.pause(),
  onHide: () => wall.resume(),
})
