// base.css paints the page atmosphere on body::before / body::after at negative z-index. A background on body itself
// would be painted above them (html already carries the night), hiding the gobo and the grain on the whole page.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/styles/base.css', import.meta.url)), 'utf8')

describe('base.css atmosphere', () => {
  it('body has no background of its own, html does', () => {
    const body = /^body\s*\{([^}]*)\}/m.exec(css)
    expect(body, 'body rule').not.toBeNull()
    expect(body?.[1]).not.toMatch(/background/)
    expect(/^html\s*\{([^}]*)\}/m.exec(css)?.[1]).toMatch(/background:\s*var\(--night\)/)
  })

  it('the atmosphere layers stay below the content', () => {
    expect(css).toMatch(/body::before\s*\{[^}]*z-index:\s*-3/)
    expect(css).toMatch(/body::after\s*\{[^}]*z-index:\s*-2/)
  })
})

// S3, S4 and S5 share one photo band recipe: on mobile the plate fills only the bottom of the section (or of its grid row),
// so the bracelet sits under the content instead of behind the text. Measured with the real plate at 390 px.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('photo band (.sec--band)', () => {
  it('base.css holds the recipe once: bottom band on mobile, whole section on desktop', () => {
    expect(css).toMatch(/\.sec--band \.sec__bg\s*\{[^}]*top:\s*auto;[^}]*height:\s*min\(100%,\s*190vw\)/)
    expect(css).toMatch(/@media \(min-width: 768px\) and \(orientation: landscape\)\s*\{\s*\.sec--band \.sec__bg\s*\{[^}]*top:\s*0;[^}]*height:\s*auto/)
    for (const f of ['how', 'token', 'roadmap']) expect(read(`../src/styles/sections/${f}.css`), `${f}.css`).not.toMatch(/\.sec__bg\s*\{[^}]*(top|height)\s*:/)
  })

  it('S3, S4 and S5 opt in', () => {
    const html = read('../classic/index.html')
    for (const id of ['how', 'token', 'roadmap']) {
      const tag = new RegExp(`<[a-z]+ class="([^"]*)" id="${id}"`).exec(html)
      expect(tag, `#${id}`).not.toBeNull()
      expect(tag?.[1]?.split(' '), `#${id}`).toContain('sec--band')
    }
  })

  it('S5 anchors the band to its content row, so the footer never ends up under the bracelet', () => {
    const roadmap = read('../src/styles/sections/roadmap.css')
    expect(roadmap).toMatch(/\.roadmap\s*\{\s*display:\s*grid;\s*\}/)
    // An absolutely positioned grid child with an `auto` end line stretches to the container's padding edge: the end lines have to be explicit.
    expect(roadmap).toMatch(/\.roadmap > \.sec__bg\s*\{\s*grid-area:\s*1 \/ 1 \/ 2 \/ 2;\s*\}/)
  })
})
