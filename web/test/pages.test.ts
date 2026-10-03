// Routing contract: Emerald.exe is the home page (/), the classic landing lives at /classic/ (noindex), /exe redirects home.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformHtml } from '../build/html.js'

const file = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url))
const read = (p: string) => readFileSync(file(p), 'utf8')
const home = read('web/index.html')
const classic = read('web/classic/index.html')
const empty = { ca: '', github: '', lqip: {}, site: '' }

describe('pages', () => {
  it('/ is Emerald.exe with the copy v2 meta and its own og card', () => {
    expect(home).toContain('<body class="exe">')
    expect(home).toContain('<script type="module" src="/src/exe/main.ts"></script>')
    expect(home).toContain('<title>Emerald · Know what you’re signing</title>')
    expect(home).toContain('<meta property="og:title" content="Emerald · Know what you’re signing" />')
    expect(home).toContain(
      '<meta property="og:description" content="A transaction checker for Ethereum, from the novel Snowmoon. Fixed rules set the verdict, and an AI explains it in plain words." />',
    )
    expect(home).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(home).not.toContain('name="robots"')
    expect(transformHtml(home, empty)).toContain('<meta property="og:image" content="/og-exe.jpg" />')
    expect(existsSync(file('web/public/og-exe.jpg'))).toBe(true)
  })

  it('the og card is a 1200x630 JPEG under 300 KB (chat apps drop heavier previews)', () => {
    const jpg = readFileSync(file('web/public/og-exe.jpg'))
    expect(jpg.length).toBeLessThan(300 * 1024)
    // Walk the JPEG segments to the first SOFn frame header: height then width, big-endian.
    let i = 2
    while (i < jpg.length && !(jpg[i + 1]! >= 0xc0 && jpg[i + 1]! <= 0xc3)) i += 2 + jpg.readUInt16BE(i + 2)
    expect([jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)]).toEqual([1200, 630])
  })

  it('/classic/ is the night landing, noindex, with its plate preloads and night og', () => {
    expect(classic).toContain('<script type="module" src="/src/main.ts"></script>')
    expect(classic).toContain('<meta name="robots" content="noindex" />')
    const out = transformHtml(classic, empty)
    expect(out).toContain('<link rel="preload" as="image" type="image/avif"')
    expect(out).toContain('content="/plates/og.jpg"')
  })

  it('the "Classic view" icon points to /classic/', () => {
    expect(home).toMatch(/<a class="icon" href="\/classic\/">[\s\S]*?<span>Classic view<\/span>/)
  })

  it('vite builds both pages; vercel redirects /exe and /exe/ home with a 301', () => {
    const vite = read('vite.config.ts')
    expect(vite).toContain("main: r('./web/index.html')")
    expect(vite).toContain("classic: r('./web/classic/index.html')")
    expect(vite).not.toContain('web/exe/')
    const vercel = JSON.parse(read('vercel.json')) as { redirects: { source: string; destination: string; statusCode: number }[]; functions: object }
    for (const source of ['/exe', '/exe/']) expect(vercel.redirects).toContainEqual({ source, destination: '/', statusCode: 301 })
    expect(Object.keys(vercel.functions)).toEqual(['api/chat.ts', 'api/check.ts'])
  })
})
