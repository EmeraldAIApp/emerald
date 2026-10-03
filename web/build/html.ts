// Build time: expands the <!--...--> tokens of both pages (web/index.html = Emerald.exe at /, web/classic/index.html at
// /classic/): plates, preloads, CA, GitHub, og:image. Each page only carries the tokens it uses.
// The served HTML already carries the real state (CA or "soon"): readable without JS and in screenshots.
import { existsSync, readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

export interface HtmlCtx {
  /** VITE_EMERALD_TOKEN_ADDRESS; empty = "CA: soon". */
  ca: string
  /** VITE_GITHUB_URL; empty = "GitHub: soon". */
  github: string
  /** name -> data URI (web/public/plates/lqip.json, written by scripts/plates.py). */
  lqip: Record<string, string>
  /** SITE_URL (https://domain, no trailing slash): X and Telegram need an absolute og:image. Empty = relative path. */
  site: string
}

const LANDSCAPE = { w: 2688, h: 1520, widths: [1280, 1920, 2688], fallback: 1280 }
const PORTRAIT = { w: 1520, h: 2688, widths: [780, 1170, 1520], fallback: 780 }
const PORTRAIT_PLATES = new Set(['hero-mobile', 'lineup-mobile'])
export const SIZES_LANDSCAPE = '(orientation: portrait) 250vw, (min-aspect-ratio: 2688/1520) 100vw, 177vh'
export const SIZES_PORTRAIT = 'max(100vw, 57vh)'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const geo = (name: string) => (PORTRAIT_PLATES.has(name) ? PORTRAIT : LANDSCAPE)
const srcset = (name: string) => geo(name).widths.map((w) => `/plates/${name}-${w}.avif ${w}w`).join(', ')
const sizes = (name: string) => (PORTRAIT_PLATES.has(name) ? SIZES_PORTRAIT : SIZES_LANDSCAPE)

export function validCa(ca: string): string {
  const v = ca.trim()
  if (v === '') return ''
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`VITE_EMERALD_TOKEN_ADDRESS is not an address: "${v}"`)
  return v
}

export function validGithub(url: string): string {
  const v = url.trim()
  if (v === '') return ''
  if (!/^https:\/\/github\.com\/[\w.-]+(\/[\w.-]+)?\/?$/.test(v)) throw new Error(`VITE_GITHUB_URL is not a GitHub repo: "${v}"`)
  return v
}

export function validSite(url: string): string {
  const v = url.trim().replace(/\/+$/, '')
  if (v === '') return ''
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(v)) throw new Error(`SITE_URL is not an https origin: "${v}"`)
  return v
}

export function pictureHtml(landscape: string, portrait: string | null, priority: boolean, lqip: Record<string, string>): string {
  const g = geo(landscape)
  const bg = lqip[landscape] ? ` style="background:#0f0c29 url(${lqip[landscape]}) center/cover no-repeat"` : ''
  const load = priority ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'
  const portraitSource = portrait
    ? `<source type="image/avif" media="(orientation: portrait)" srcset="${srcset(portrait)}" sizes="${sizes(portrait)}">`
    : ''
  return (
    `<picture class="plate">${portraitSource}` +
    `<source type="image/avif" srcset="${srcset(landscape)}" sizes="${sizes(landscape)}">` +
    `<img src="/plates/${landscape}-${g.fallback}.jpg" alt="" width="${g.w}" height="${g.h}" ${load}${bg}></picture>`
  )
}

export function preloadHtml(landscape: string, portrait: string): string {
  const link = (name: string, media: string) =>
    `<link rel="preload" as="image" type="image/avif" fetchpriority="high" media="${media}" imagesrcset="${srcset(name)}" imagesizes="${sizes(name)}">`
  return link(landscape, '(orientation: landscape)') + link(portrait, '(orientation: portrait)')
}

export const OG_DEFAULT = '/plates/og.jpg'

export function ogHtml(site: string, img: string): string {
  const url = `${site}${img}`
  return `<meta property="og:image" content="${url}" />` + `<meta name="twitter:image" content="${url}" />`
}

const shortCa = (ca: string) => `${ca.slice(0, 6)}…${ca.slice(-4)}`

export function transformHtml(html: string, ctx: HtmlCtx): string {
  const ca = validCa(ctx.ca)
  const gh = validGithub(ctx.github)
  const site = validSite(ctx.site)
  const tokens: Record<string, string> = {
    'ca:label': ca ? `CA: ${ca}` : 'CA: soon',
    'ca:short': ca ? `CA: ${shortCa(ca)}` : 'CA: soon',
    'ca:big': ca ? `<p class="ca-big is-long">CA: ${ca}</p>` : '<p class="ca-big">CA: soon</p>',
    'ca:actions': ca
      ? `<button type="button" class="dv__btn" data-copy-ca="${ca}">Copy</button>` +
        `<a class="dv__btn" href="https://etherscan.io/token/${ca}" target="_blank" rel="noopener noreferrer">Etherscan</a>`
      : `<button type="button" class="dv__btn" disabled>Copy</button><button type="button" class="dv__btn" disabled>Etherscan</button>`,
    'link:github': gh ? `<a class="foot__link" href="${esc(gh)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : '<span class="foot__link is-soon">GitHub: soon</span>',
  }
  return html
    .replace(/<!--(ca:label|ca:short|ca:big|ca:actions|link:github)-->/g, (_m, k: string) => tokens[k] ?? '')
    // <!--meta:og--> = the classic night plate; <!--meta:og:/og-exe.jpg--> = a page's own card (path under web/public).
    .replace(/<!--meta:og(?::(\/[a-z0-9/._-]+))?-->/g, (_m, img: string | undefined) => ogHtml(site, img ?? OG_DEFAULT))
    .replace(/<!--plate:([a-z-]+)(?::([a-z-]+))?(:priority)?-->/g, (_m, land: string, port: string | undefined, prio: string | undefined) =>
      pictureHtml(land, port ?? null, Boolean(prio), ctx.lqip),
    )
    .replace(/<!--preload:([a-z-]+):([a-z-]+)-->/g, (_m, land: string, port: string) => preloadHtml(land, port))
}

export function readLqip(file: string): Record<string, string> {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : {}
}

export function emeraldHtml(ctx: () => HtmlCtx): Plugin {
  return {
    name: 'emerald-html',
    transformIndexHtml: { order: 'pre', handler: (html) => transformHtml(html, ctx()) },
  }
}
