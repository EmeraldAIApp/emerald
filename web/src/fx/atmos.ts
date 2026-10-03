// The living night (rich tier): ONE fixed WebGL canvas, a single full-screen quad, between the photos and the content.
// It paints only light (mix-blend-mode: screen over the photos and the night), so the text panels above it are never
// touched. What it draws, every frame, from the real on-screen position of each photo:
//  - indigo/violet fog that drifts and is lit by the moon of the photo on screen (never a flat plane between sections);
//  - volumetric moonbeams leaving each photo's window, with dust floating inside the beams only;
//  - snow in three depths (far, mid, near bokeh) with scroll and mouse parallax, heavier over the hero;
//  - the bracelet as a real light source: a slow pulsing halo that tints the fog around it, and on a verdict a wave
//    of the verdict color that runs through the fog;
//  - section tones (moon high -> the table -> violet dawn under the roadmap), blended by visibility (fx/tones.ts).
// Budget: canvas at 0.55x the CSS size (fog and bokeh are soft by nature), DPR <= 1.5, paused when the tab is hidden.
import type { LightLevel } from '../light/light.js'
import { activeGeo } from '../light/stage.js'
import { SCENES } from './scene.js'
import { BAND, blendTones, type Rgb } from './tones.js'

const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`

const FRAG = `precision highp float;
uniform vec2 uView;
uniform float uScale, uTime, uScroll;
uniform vec2 uMouse;
uniform vec3 uDeep, uLit, uRay;
uniform float uDawn, uSnow;
uniform vec4 uMoon[2];
uniform vec2 uClip[2];
uniform vec2 uAim[2];
uniform vec4 uBand[2];
uniform vec3 uBandCol[2];
uniform vec4 uWave;
uniform vec3 uWaveCol;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = m * p; a *= 0.5; }
  return s;
}
// One snow layer: one flake per cell at most (cell px), falling at speed px/s, with scroll (k) and mouse (mk) parallax.
float snow(vec2 p, float cell, float speed, float r, float blur, float prob, float k, float mk, float seed) {
  vec2 q = p + vec2(uMouse.x * mk, uScroll * k + uMouse.y * mk * 0.6);
  q.y -= uTime * speed;
  q.x += sin(uTime * 0.21 + q.y / cell * 0.7 + seed) * cell * 0.18;
  vec2 id = floor(q / cell), f = fract(q / cell);
  float h = hash(id + seed);
  vec2 c = vec2(hash(id + seed + 1.7), hash(id + seed + 4.1)) * 0.6 + 0.2;
  c.x += sin(uTime * (0.4 + h) + h * 6.283) * 0.07;
  float d = length(f - c) * cell;
  return step(h, prob) * smoothstep(r + blur, max(0.0, r - blur * 0.35), d) * (0.6 + 0.4 * hash(id + seed + 9.3));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y * uScale - gl_FragCoord.y) / uScale;   // CSS px, y down
  float H = uView.y;
  float t = uTime;

  // ---- fog: two warped fbm sheets at different depths (the far one barely follows the scroll)
  vec2 q = p / H;
  vec2 f1 = q * 1.5 + vec2(t * 0.011, uScroll / H * 0.25) + uMouse * 0.015;
  float w = fbm(f1 + vec2(t * 0.017, -t * 0.006));
  float d1 = fbm(f1 * 1.2 + 1.8 * vec2(w, w * 0.6) + vec2(-t * 0.012, t * 0.008));
  vec2 f2 = q * 2.6 + vec2(-t * 0.02, uScroll / H * 0.6) + uMouse * 0.035;
  float d2 = fbm(f2 + vec2(w * 1.3, t * 0.01));
  float fog = smoothstep(0.28, 0.85, d1) * 0.75 + smoothstep(0.42, 0.9, d2) * 0.45;

  // ---- moonlight, beams and the dust inside them
  float moonLight = 0.0, beams = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 m = uMoon[i];
    if (m.w <= 0.0) continue;
    vec2 v = p - m.xy;
    float dist = length(v);
    vec2 dir = v / max(dist, 1.0);
    float clip = smoothstep(uClip[i].x - 40.0, uClip[i].x + 140.0, p.y) * (1.0 - smoothstep(uClip[i].y - 220.0, uClip[i].y, p.y));
    moonLight += m.w * clip * exp(-dist / (H * 0.62));
    float ang = atan(dir.x, dir.y);
    float sh = noise(vec2(ang * 7.0 + float(i) * 13.0, t * 0.045)) * 0.62 + noise(vec2(ang * 19.0 + 3.0, t * 0.07)) * 0.38;
    sh = smoothstep(0.38, 0.8, sh);
    // The light falls from the window toward the bracelet (the hand on the table): a soft cone around that axis.
    float down = smoothstep(0.25, 0.92, dot(dir, uAim[i])) * smoothstep(-0.2, 0.3, dir.y);
    float fall = exp(-dist / (H * 0.78)) * smoothstep(m.z * 0.9, m.z * 2.6, dist);
    float breath = 0.82 + 0.18 * sin(t * 0.37 + float(i) * 2.1);
    beams += m.w * clip * sh * down * fall * breath;
  }
  float dust = snow(p, 23.0, -4.0, 0.7, 0.9, 0.55, 0.35, 3.0, 31.0) * (0.55 + 0.45 * sin(t * 1.7 + p.x * 0.05 + p.y * 0.031));
  dust += snow(p, 41.0, 6.0, 1.0, 1.4, 0.4, 0.6, 6.0, 47.0);

  vec3 fogCol = mix(uDeep, uLit, clamp(moonLight * 1.4, 0.0, 1.0));
  vec3 c = fogCol * fog * (0.42 + 0.95 * moonLight);
  c += uRay * beams * (0.34 + 0.6 * fog);
  c += uRay * dust * min(beams * 3.0, 1.0) * 0.9;

  // ---- snow: far, mid and near (bokeh), lit a little by the moon
  float lit = 0.55 + 0.9 * clamp(moonLight, 0.0, 1.0);
  float s = snow(p, 34.0, 26.0, 1.1, 0.9, 0.42, 0.18, 4.0, 1.0) * 0.32
          + snow(p, 86.0, 48.0, 1.9, 1.3, 0.36, 0.5, 11.0, 7.0) * 0.5
          + snow(p, 230.0, 86.0, 4.4, 5.5, 0.28, 1.25, 26.0, 17.0) * 0.36;
  c += vec3(0.86, 0.89, 1.0) * s * uSnow * lit;

  // ---- the bracelet: a light source that breathes and tints the fog around it
  for (int i = 0; i < 2; i++) {
    vec4 b = uBand[i];
    if (b.w <= 0.0) continue;
    float d = length(p - b.xy);
    float pulse = 0.72 + 0.28 * sin(t * 1.6 + float(i));
    float halo = exp(-(d * d) / (b.z * b.z * 5.0));
    c += uBandCol[i] * b.w * pulse * (halo * 0.12 + halo * fog * 0.6 + exp(-d / (b.z * 0.9)) * 0.06);
  }

  // ---- verdict wave: a ring of the verdict color that runs through the fog and fades
  if (uWave.z >= 0.0) {
    float R = uWave.z * H * 1.5;
    float d = length(p - uWave.xy);
    float wd = 50.0 + R * 0.3;
    float ring = exp(-((d - R) * (d - R)) / (wd * wd));
    float inner = (1.0 - smoothstep(0.0, R + 1.0, d)) * 0.25;
    c += uWaveCol * (ring + inner) * (0.24 + fog * 1.1) * (1.0 - uWave.z) * uWave.w;
  }

  // ---- violet dawn under the roadmap
  float dawn = smoothstep(H * 0.25, H * 1.1, p.y) * uDawn;
  c += mix(vec3(0.42, 0.22, 0.62), vec3(0.78, 0.42, 0.62), smoothstep(H * 0.7, H * 1.1, p.y)) * dawn * (0.08 + 0.3 * fog);

  c += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;   // dither: no banding in the soft gradients
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`

export interface Atmos {
  setVerdict(level: LightLevel): void
  fps(): number
}

interface Slot { moon: [number, number, number, number]; clip: [number, number]; aim: [number, number]; band: [number, number, number, number]; col: Rgb }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp3 = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

export function mountAtmos(): Atmos | null {
  const canvas = document.createElement('canvas')
  canvas.className = 'fx-atmos'
  canvas.setAttribute('aria-hidden', 'true')
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
  if (!gl) return null
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const prog = gl.createProgram()!
  try {
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link')
  } catch (e) {
    console.warn('[atmos] WebGL program failed, light tier instead', e)
    return null
  }
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const U = (n: string) => gl.getUniformLocation(prog, n)
  const u = {
    view: U('uView'), scale: U('uScale'), time: U('uTime'), scroll: U('uScroll'), mouse: U('uMouse'),
    deep: U('uDeep'), lit: U('uLit'), ray: U('uRay'), dawn: U('uDawn'), snow: U('uSnow'),
    moon: U('uMoon'), clip: U('uClip'), aim: U('uAim'), band: U('uBand'), bandCol: U('uBandCol'), wave: U('uWave'), waveCol: U('uWaveCol'),
  }

  document.body.prepend(canvas)
  document.documentElement.classList.add('has-atmos')

  // ---- size: 0.55x of the CSS size times the capped DPR (soft content; this is the whole GPU budget)
  let scale = 1
  const resize = () => {
    scale = Math.min(devicePixelRatio || 1, 1.5) * 0.55
    canvas.width = Math.max(2, Math.round(innerWidth * scale))
    canvas.height = Math.max(2, Math.round(innerHeight * scale))
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  resize()
  addEventListener('resize', resize, { passive: true })

  // ---- inputs: mouse (smoothed), verdict, the stages
  let mx = 0, my = 0, tmx = 0, tmy = 0
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    tmx = (e.clientX / innerWidth) * 2 - 1
    tmy = (e.clientY / innerHeight) * 2 - 1
  }, { passive: true })

  const stages = [...document.querySelectorAll<HTMLElement>('main .sec [data-stage]')]
  const reactive = new Set(stages.filter((s) => s.hasAttribute('data-reactive')))
  let verdictCol: Rgb = BAND.idle
  let shownCol: Rgb = BAND.idle
  let waveStart = -1
  let waveCol: Rgb = BAND.idle
  let waveAt: [number, number] = [0, 0]

  function slotFor(stage: HTMLElement): { vis: number; id: string; slot: Slot } | null {
    const bg = stage.closest<HTMLElement>('.sec__bg')
    const sec = stage.closest<HTMLElement>('.sec')
    const active = activeGeo(stage)
    if (!bg || !sec || !active) return null
    const b = bg.getBoundingClientRect()
    const vis = (Math.min(b.bottom, innerHeight) - Math.max(b.top, 0)) / innerHeight
    if (vis <= 0) return null
    const r = stage.getBoundingClientRect()
    const sc = SCENES[active.name]
    const [[x0, y0], , [x2, y2]] = active.geo.screen
    const bx = r.left + (((x0 + x2) / 2) / active.geo.w) * r.width
    const by = r.top + (((y0 + y2) / 2) / active.geo.h) * r.height
    const br = (Math.abs(x2 - x0) / active.geo.w) * r.width * 0.5
    const w = clamp01(vis * 1.8)
    const mx0 = sc ? r.left + sc.moon[0] * r.width : bx
    const my0 = sc ? r.top + sc.moon[1] * r.height : by - 1
    const len = Math.hypot(bx - mx0, by - my0) || 1
    return {
      vis,
      id: sec.id,
      slot: {
        moon: sc ? [r.left + sc.moon[0] * r.width, r.top + sc.moon[1] * r.height, sc.moon[2] * r.width, w] : [0, 0, 0, 0],
        clip: [b.top, b.bottom],
        aim: [(bx - mx0) / len, (by - my0) / len],
        band: [bx, by, Math.max(30, br), w * (reactive.has(stage) ? 1 : 0.35)],
        col: reactive.has(stage) ? shownCol : BAND.idle,
      },
    }
  }

  const empty: Slot = { moon: [0, 0, 0, 0], clip: [0, 0], aim: [0, 1], band: [0, 0, 0, 0], col: BAND.idle }
  const t0 = performance.now()
  let raf = 0
  let last = 0
  let frames = 0
  let fpsAcc = 0
  let fpsNow = 0
  let fpsAt = t0

  const frame = (now: number) => {
    raf = 0
    if (document.hidden) return
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016)
    last = now
    frames++
    if (now - fpsAt >= 1000) {
      fpsNow = (frames * 1000) / (now - fpsAt)
      fpsAcc = fpsAcc ? fpsAcc * 0.7 + fpsNow * 0.3 : fpsNow
      frames = 0
      fpsAt = now
    }
    const ease = 1 - Math.exp(-dt * 2.2)
    mx += (tmx - mx) * ease
    my += (tmy - my) * ease

    // The verdict color reaches the bracelet halo as the wave leaves it.
    const tw = waveStart < 0 ? 1 : (now - waveStart) / 1800
    if (tw >= 0.15) shownCol = lerp3(shownCol, verdictCol, 1 - Math.exp(-dt * 3))

    const found = stages.map(slotFor).filter((x): x is NonNullable<ReturnType<typeof slotFor>> => Boolean(x)).sort((a, b) => b.vis - a.vis)
    const slots = [found[0]?.slot ?? empty, found[1]?.slot ?? empty]
    const tone = blendTones(found.map((f) => ({ id: f.id, w: f.vis * f.vis })))
    if (found.length && waveStart >= 0 && tw < 0.02) {
      // Anchor the wave on the reactive bracelet that is on screen.
      const rx = found.find((f) => f.id === 'try' || f.id === 'how')
      if (rx) waveAt = [rx.slot.band[0], rx.slot.band[1]]
    }

    gl.uniform2f(u.view, innerWidth, innerHeight)
    gl.uniform1f(u.scale, canvas.height / innerHeight)
    gl.uniform1f(u.time, (now - t0) / 1000)
    gl.uniform1f(u.scroll, scrollY)
    gl.uniform2f(u.mouse, mx, my)
    gl.uniform3fv(u.deep, tone.deep)
    gl.uniform3fv(u.lit, tone.lit)
    gl.uniform3fv(u.ray, tone.ray)
    gl.uniform1f(u.dawn, tone.dawn)
    gl.uniform1f(u.snow, tone.snow)
    gl.uniform4fv(u.moon, [...slots[0]!.moon, ...slots[1]!.moon])
    gl.uniform2fv(u.clip, [...slots[0]!.clip, ...slots[1]!.clip])
    gl.uniform2fv(u.aim, [...slots[0]!.aim, ...slots[1]!.aim])
    gl.uniform4fv(u.band, [...slots[0]!.band, ...slots[1]!.band])
    gl.uniform3fv(u.bandCol, [...slots[0]!.col, ...slots[1]!.col])
    gl.uniform4f(u.wave, waveAt[0], waveAt[1], waveStart < 0 || tw >= 1 ? -1 : tw, 1)
    gl.uniform3fv(u.waveCol, waveCol)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  const start = () => {
    if (!raf && !document.hidden) {
      last = 0
      raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    } else start()
  })
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    cancelAnimationFrame(raf)
    raf = 0
    canvas.remove()
    document.documentElement.classList.remove('has-atmos')
  })
  start()

  let level: LightLevel = 'idle'
  const api: Atmos = {
    setVerdict(next) {
      if (next === level) return
      level = next
      verdictCol = BAND[next]
      if (next === 'idle') return
      waveCol = BAND[next]
      waveStart = performance.now() + 80 // same 80 ms screen refresh as the photo light (motion.ts setLight)
    },
    fps: () => Math.round(fpsAcc),
  }
  ;(window as unknown as { __emeraldAtmos?: unknown }).__emeraldAtmos = { tier: 'webgl', fps: api.fps, now: () => Math.round(fpsNow) }
  return api
}
