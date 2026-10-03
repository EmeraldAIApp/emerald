import { describe, expect, it } from 'vitest'
import { pictureHtml, preloadHtml, transformHtml, validCa, validGithub, validSite } from '../build/html.js'

const CA = '0x3f1c00000000000000000000000000000000a9e2'
const empty = { ca: '', github: '', lqip: {}, site: '' }

describe('build html tokens', () => {
  it('CA soon until launch', () => {
    const out = transformHtml('<b><!--ca:label--></b><i><!--ca:short--></i><!--ca:big--><!--ca:actions-->', empty)
    expect(out).toContain('<b>CA: soon</b><i>CA: soon</i>')
    expect(out).toContain('<p class="ca-big">CA: soon</p>')
    expect(out).toContain('<button type="button" class="dv__btn" disabled>Copy</button>')
    expect(out).not.toContain('etherscan.io')
  })

  it('real CA after launch: full label, short chip, copy and Etherscan', () => {
    const out = transformHtml('<b><!--ca:label--></b><i><!--ca:short--></i><!--ca:big--><!--ca:actions-->', { ...empty, ca: CA })
    expect(out).toContain(`<p class="ca-big is-long">CA: ${CA}</p>`)
    expect(out).toContain(`<b>CA: ${CA}</b>`)
    expect(out).toContain('<i>CA: 0x3f1c…a9e2</i>')
    expect(out).toContain(`data-copy-ca="${CA}"`)
    expect(out).toContain(`href="https://etherscan.io/token/${CA}"`)
  })

  it('rejects a malformed CA or GitHub URL at build time', () => {
    expect(() => validCa('0x123')).toThrow()
    expect(validCa(`  ${CA} `)).toBe(CA)
    expect(() => validGithub('https://evil.example/x')).toThrow()
    expect(validGithub('https://github.com/emerald-guard/emerald')).toBe('https://github.com/emerald-guard/emerald')
  })

  it('GitHub soon or link', () => {
    expect(transformHtml('<!--link:github-->', empty)).toBe('<span class="foot__link is-soon">GitHub: soon</span>')
    expect(transformHtml('<!--link:github-->', { ...empty, github: 'https://github.com/a/b' })).toContain('href="https://github.com/a/b"')
  })

  it('plate token: portrait source first, AVIF srcset, JPG fallback with real size, lazy unless priority', () => {
    const out = transformHtml('<!--plate:hero-desktop:hero-mobile:priority-->', { ...empty, lqip: { 'hero-desktop': 'data:image/jpeg;base64,AAA' } })
    expect(out.indexOf('media="(orientation: portrait)"')).toBeLessThan(out.indexOf('hero-desktop-1280.avif'))
    expect(out).toContain('/plates/hero-mobile-1520.avif 1520w')
    expect(out).toContain('/plates/hero-desktop-2688.avif 2688w')
    expect(out).toContain('src="/plates/hero-desktop-1280.jpg" alt="" width="2688" height="1520" fetchpriority="high"')
    expect(out).toContain('url(data:image/jpeg;base64,AAA)')
    const lazy = pictureHtml('book-desktop', null, false, {})
    expect(lazy).toContain('loading="lazy"')
    expect(lazy).not.toContain('media="(orientation: portrait)"')
  })

  it('preload links per orientation', () => {
    const out = preloadHtml('hero-desktop', 'hero-mobile')
    expect(out).toContain('media="(orientation: landscape)" imagesrcset="/plates/hero-desktop-1280.avif')
    expect(out).toContain('media="(orientation: portrait)" imagesrcset="/plates/hero-mobile-780.avif')
  })

  it('absolute og:image when SITE_URL is set', () => {
    expect(transformHtml('<!--meta:og-->', empty)).toContain('content="/plates/og.jpg"')
    expect(transformHtml('<!--meta:og-->', { ...empty, site: 'https://emerald.example/' })).toContain('content="https://emerald.example/plates/og.jpg"')
    expect(() => validSite('http://insecure.example')).toThrow()
  })

  it('per-page og:image: <!--meta:og:/path--> overrides the classic plate', () => {
    const out = transformHtml('<!--meta:og:/og-exe.jpg-->', { ...empty, site: 'https://emerald.example' })
    expect(out).toContain('<meta property="og:image" content="https://emerald.example/og-exe.jpg" />')
    expect(out).toContain('<meta name="twitter:image" content="https://emerald.example/og-exe.jpg" />')
    expect(out).not.toContain('og.jpg')
  })

  it('leaves unknown comments alone', () => {
    expect(transformHtml('<!-- a normal comment -->', empty)).toBe('<!-- a normal comment -->')
  })
})
