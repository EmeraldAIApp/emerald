// Mounts each stage: scales the plate space, projects the mini-screens, draws marks and the loupe.
import { loupeLines, quadMatrix, toMatrix3d, type Pt } from './geometry.js'
import { readyWhenDecoded } from './light.js'
import { PLATES } from './plates.generated.js'
import type { PlateGeo } from './plates.js'

const portrait = () => matchMedia('(orientation: portrait)')

export function activeGeo(stage: HTMLElement): { name: string; geo: PlateGeo } | null {
  const name = (portrait().matches && stage.dataset.platePortrait) || stage.dataset.plate || ''
  const geo = PLATES[name]
  return geo ? { name, geo } : null
}

const NS = 'http://www.w3.org/2000/svg'
function svgEl(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  if (text) el.textContent = text
  return el
}

function drawMarks(svg: SVGSVGElement, geo: PlateGeo): void {
  svg.replaceChildren()
  svg.setAttribute('viewBox', `0 0 ${geo.w} ${geo.h}`)
  for (const [x, y] of geo.dots ?? []) svg.append(svgEl('text', { x, y, 'text-anchor': 'middle', class: 'dots' }, '…'))
  const marks = geo.marks ?? []
  const first = marks[0]
  const last = marks[marks.length - 1]
  if (first && last) svg.append(svgEl('line', { x1: first[0] - 120, y1: first[1] - 18, x2: last[0] + 260, y2: last[1] + 30 }))
  marks.forEach(([x, y], i) => svg.append(svgEl('text', { x, y, 'text-anchor': 'middle' }, String(i + 1))))
}

export function mountStage(stage: HTMLElement): void {
  const space = stage.querySelector<HTMLElement>('.plate-space')
  const apply = () => {
    const active = activeGeo(stage)
    stage.classList.toggle('is-mapped', Boolean(active))
    if (!active) return
    const { name, geo } = active
    stage.style.setProperty('--k', String(stage.clientWidth / geo.w))
    if (space) {
      space.style.width = `${geo.w}px`
      space.style.height = `${geo.h}px`
    }
    for (const mini of stage.querySelectorAll<HTMLElement>('[data-mini]')) {
      const w = Number(mini.dataset.w)
      const h = Number(mini.dataset.h)
      mini.style.width = `${w}px`
      mini.style.height = `${h}px`
      mini.style.transform = toMatrix3d(quadMatrix(w, h, geo.screen))
    }
    const marks = stage.querySelector<SVGSVGElement>('[data-marks]')
    if (marks) drawMarks(marks, geo)
    if (stage.hasAttribute('data-reactive') && geo.light) {
      stage.style.setProperty('--sx', geo.light.sx)
      stage.style.setProperty('--sy', geo.light.sy)
      stage.style.setProperty('--wx', geo.light.wx)
      stage.style.setProperty('--wy', geo.light.wy)
      const spill = `/plates/${name}-mask-a.webp`
      stage.style.setProperty('--spill', `url("${spill}")`)
      // has-light only once the mask has loaded: if the .webp is missing (404), the light layers stay unmasked
      // and tint the WHOLE section (seen in Chromium with a missing mask).
      const probe = new Image()
      probe.onload = () => stage.classList.toggle('has-light', activeGeo(stage)?.name === name)
      probe.onerror = () => stage.classList.remove('has-light')
      probe.src = spill
    } else {
      stage.classList.remove('has-light')
    }
    stage.dispatchEvent(new CustomEvent('stage:mapped'))
  }
  new ResizeObserver(apply).observe(stage)
  portrait().addEventListener('change', apply)
  apply()
  readyWhenDecoded(stage)
}

/** The two loupe hairlines between the bracelet screen and its panel. */
export function mountLoupe(svg: SVGSVGElement): void {
  const section = svg.closest<HTMLElement>('.sec')
  const stage = section?.querySelector<HTMLElement>('[data-stage]')
  const panel = document.getElementById(svg.dataset.loupe ?? '')
  if (!section || !stage || !panel) return
  const draw = () => {
    const active = activeGeo(stage)
    if (!active || getComputedStyle(svg).display === 'none') return void svg.replaceChildren()
    const sec = section.getBoundingClientRect()
    const st = stage.getBoundingClientRect()
    const p = panel.getBoundingClientRect()
    const k = st.width / active.geo.w
    const quad = active.geo.screen.map(([x, y]) => [st.left - sec.left + x * k, st.top - sec.top + y * k] as Pt) as [Pt, Pt, Pt, Pt]
    const lines = loupeLines(quad, { left: p.left - sec.left, top: p.top - sec.top, right: p.right - sec.left, bottom: p.bottom - sec.top })
    svg.setAttribute('viewBox', `0 0 ${sec.width} ${sec.height}`)
    svg.replaceChildren(...lines.map(([a, b]) => svgEl('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] })))
  }
  const ro = new ResizeObserver(draw)
  ro.observe(section)
  ro.observe(panel)
  stage.addEventListener('stage:mapped', draw)
  // Parallax (fx/scroll.ts) moves the photo and the panels every frame: one redraw per frame, before paint.
  let queued = false
  stage.addEventListener('stage:moved', () => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      draw()
    })
  })
  draw()
}
