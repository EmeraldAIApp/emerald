import './styles/tokens.css'
import './styles/base.css'
import './styles/device-view.css'
import './styles/light.css'
import './styles/sections/hero.css'
import './styles/sections/lineup.css'
import './styles/sections/book.css'
import './styles/sections/how.css'
import './styles/sections/token.css'
import './styles/sections/roadmap.css'
import './styles/motion.css'
import './styles/atmos.css'
import { mountChat } from './chat/controller.js'
import { lightLevel, type ChatState } from './chat/machine.js'
import { renderChecks, renderMini } from './chat/render.js'
import { setLightInstant } from './light/light.js'
import { heroIntro, reveals, setLight, settleRows, still, typeVerdict } from './motion.js'
import { richMotion } from './fx/env.js'
import { liftLoader, mountGrain, mountHoverLight } from './fx/polish.js'
import { mountMoon, mountSnow } from './fx/snow.js'
import { mountAtmosLite } from './fx/atmos-lite.js'
import type { Atmos } from './fx/atmos.js'
import { mountLoupe, mountStage } from './light/stage.js'
import { createQuota, fitPlaceholder, mountCompute } from './page.js'
import { mountCopyCa } from './sections/lineup.js'
import { mountNav, mountOpenEmerald } from './sections/nav.js'
import { mountLoan } from './sections/roadmap.js'

const CA = (import.meta.env.VITE_EMERALD_TOKEN_ADDRESS ?? '').trim()
const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)

const stages = [...document.querySelectorAll<HTMLElement>('[data-stage]')]
stages.forEach(mountStage)
document.querySelectorAll<SVGSVGElement>('[data-loupe]').forEach(mountLoupe)
mountNav()
mountCopyCa()
mountLoan()

// ---- quota + SIWE (only once the token exists: before that there are no holders) and the compute counter (S4)
const quota = createQuota($<HTMLElement>('[data-quota]')!, () => chat.dispatch({ type: 'reset' }))
const refreshCompute = mountCompute($<HTMLElement>('[data-compute]'))

// ---- the chat and everything that mirrors its state (mini-screens, S3, light, outline)
const hero = $<HTMLElement>('#try')!
const how = $<HTMLElement>('#how')
const reactive = stages.filter((s) => s.hasAttribute('data-reactive'))
reactive.forEach((s) => setLightInstant(s, 'idle'))

function mirror(s: ChatState): void {
  const level = lightLevel(s)
  hero.dataset.verdict = level
  if (how) how.dataset.verdict = level
  const mini = renderMini(s)
  document.querySelectorAll<HTMLElement>('.mini--chat').forEach((m) => {
    m.dataset.verdict = mini.level
    m.querySelector('[data-mini-text]')!.textContent = mini.text
  })
  const checks = $<HTMLTableElement>('[data-checks]')
  if (checks) checks.innerHTML = renderChecks(s)
  const howPanel = $<HTMLElement>('.how__panel')
  if (howPanel) howPanel.dataset.verdict = level
  const screens = [...document.querySelectorAll<HTMLElement>('.mini--chat, .hero__panel, .how__panel')]
  reactive.forEach((st) => void setLight(st, level, screens))
  atmosLevel = level
  atmos?.setVerdict(level)
}

// The living night behind the content: WebGL on the rich tier (loaded on demand), CSS + 2D canvas everywhere else.
let atmos: Atmos | null = null
let atmosLevel: ReturnType<typeof lightLevel> = 'idle'

const chat = mountChat(
  {
    panel: $<HTMLElement>('.hero__panel')!,
    screen: $<HTMLTableElement>('[data-screen]')!,
    form: $<HTMLFormElement>('[data-chat-form]')!,
    input: $<HTMLTextAreaElement>('#chat-input')!,
    submit: $<HTMLButtonElement>('.dv__submit')!,
    chips: $<HTMLElement>('[data-chips]')!,
    announce: $<HTMLElement>('[data-announce]')!,
  },
  {
    canSignIn: CA !== '',
    userAddress: quota.address,
    onChange: (s, prev) => {
      const newVerdict = s.kind === 'verdict' && (prev.kind !== 'verdict' || prev.verdict !== s.verdict)
      if (s.kind !== prev.kind || newVerdict) {
        mirror(s)
        // The new state settles in row by row; a verdict headline types itself on the panel and on the bracelet.
        settleRows($<HTMLElement>('[data-screen]'))
        settleRows($<HTMLElement>('[data-checks]'))
        if (newVerdict) {
          typeVerdict($<HTMLElement>('[data-screen] .dv__verdict'))
          document.querySelectorAll<HTMLElement>('.mini--chat [data-mini-text]').forEach((m) => typeVerdict(m, 40))
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
mirror(chat.state)
mountOpenEmerald($<HTMLTextAreaElement>('#chat-input')!)
void quota.refresh()
fitPlaceholder($<HTMLTextAreaElement>('#chat-input')!)

// ---- motion pass: loader -> hero entrance, reveals, and the rich tier (smooth scroll, parallax, snow, live grain)
const rich = richMotion()
document.documentElement.classList.toggle('is-rich', rich)
mountHoverLight()
mountGrain(rich)
if (!still()) stages.forEach(mountMoon)
if (rich) {
  void import('./fx/atmos.js')
    .then(({ mountAtmos }) => {
      atmos = mountAtmos()
      if (!atmos) return mountAtmosLite()
      atmos.setVerdict(atmosLevel)
    })
    .catch(() => mountAtmosLite())
} else mountAtmosLite()
if (rich) {
  stages.forEach(mountSnow)
  // Loaded on demand: GSAP + Lenis never reach phones or reduced-motion visitors.
  void import('./fx/scroll.js').then(({ mountScroll }) => mountScroll())
}
liftLoader(() => heroIntro(rich))
reveals(undefined, rich)
