// / (Emerald.exe) live wallpaper: one low-res WebGL canvas, upscaled with image-rendering: pixelated.
//   pass 1 · a full-screen triangle: violet/lavender plasma that flows slowly, quantized to a 6-step palette with
//            ordered (Bayer 8x8) dither, a faint retro checker, twinkling pixel stars, an occasional shooting star,
//            the crescent moon with a breathing halo, the ETH glow + floor shadow, and the verdict wave (red / green).
//   pass 2 · the ETH diamond as a 24-triangle low-poly mesh, flat-shaded and dithered with the same matrix.
// No three.js: two draw calls in one context are cheaper than the library. Desktop + fine pointer only; phones and
// GL-less browsers keep the CSS wallpaper (.plasma). Reduced motion renders one still frame. Pauses when hidden.

const calm = matchMedia('(prefers-reduced-motion: reduce)')
const wide = matchMedia('(min-width: 900px) and (pointer: fine)')

/** CSS px per wallpaper pixel: the dither cell. Independent of devicePixelRatio, so it looks the same everywhere. */
const CELL = 3

const VERT_QUAD = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

// Shared GLSL: Bayer 8x8 threshold in [0,1) from integer pixel coords.
const BAYER = `
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
`

const FRAG_WALL = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uMouse;   // x, y (wallpaper px, y up), presence 0..1
uniform vec3 uMoon;    // cx, cy, r
uniform vec4 uEth;     // cx, cy, half-height, visible
uniform vec4 uWave;    // ox, oy, progress 0..1, amount 0..1
uniform float uWaveKind; // 0 red, 1 green
uniform vec4 uShoot;   // x0, y0, progress 0..1, active
uniform float uCheck;  // checker size in wallpaper px
${BAYER}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 pal(float i) { // desk: deep indigo -> lavender
  vec3 c = vec3(0.243, 0.255, 0.722);
  c = mix(c, vec3(0.333, 0.369, 0.851), step(0.5, i));
  c = mix(c, vec3(0.400, 0.494, 0.918), step(1.5, i));
  c = mix(c, vec3(0.490, 0.561, 0.941), step(2.5, i));
  c = mix(c, vec3(0.604, 0.651, 0.961), step(3.5, i));
  c = mix(c, vec3(0.765, 0.784, 0.984), step(4.5, i));
  return c;
}
vec3 palRed(float i) {
  vec3 c = vec3(0.290, 0.039, 0.122);
  c = mix(c, vec3(0.459, 0.067, 0.165), step(0.5, i));
  c = mix(c, vec3(0.690, 0.082, 0.110), step(1.5, i));
  c = mix(c, vec3(0.878, 0.220, 0.243), step(2.5, i));
  c = mix(c, vec3(0.973, 0.478, 0.431), step(3.5, i));
  c = mix(c, vec3(1.000, 0.776, 0.718), step(4.5, i));
  return c;
}
vec3 palGreen(float i) {
  vec3 c = vec3(0.043, 0.239, 0.169);
  c = mix(c, vec3(0.067, 0.443, 0.247), step(0.5, i));
  c = mix(c, vec3(0.122, 0.616, 0.353), step(1.5, i));
  c = mix(c, vec3(0.235, 0.902, 0.549), step(2.5, i));
  c = mix(c, vec3(0.561, 0.961, 0.741), step(3.5, i));
  c = mix(c, vec3(0.839, 1.000, 0.910), step(4.5, i));
  return c;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  float th = bayer8(px);
  float t = uTime * 0.07;

  // plasma: two layers of domain-warped sines, flowing slowly; the pointer bends it a little
  vec2 uv = px / uRes.y;
  vec2 m = uMouse.xy / uRes.y;
  vec2 dm = uv - m;
  float near = uMouse.z * exp(-dot(dm, dm) * 9.0);
  vec2 p = uv * 1.7 + dm * near * 0.35;
  vec2 w = vec2(sin(p.y * 1.3 + t * 3.1) + sin(p.y * 0.7 - t * 1.7), cos(p.x * 1.1 - t * 2.3) + cos(p.x * 0.6 + t * 1.3));
  p += w * 0.38;
  float f = sin(p.x * 1.8 + t * 2.0) + sin(p.y * 2.2 - t * 1.6) + sin((p.x + p.y) * 1.3 + t * 1.1);
  float v = 0.37 + f * 0.105;
  v -= (px.y / uRes.y) * 0.12;                       // darker towards the top, like a sky
  v += near * 0.15;                                   // a soft light follows the pointer
  v += mod(floor(px.x / uCheck) + floor(px.y / uCheck), 2.0) * 0.022; // the old desktop checker, barely there

  // ETH: breathing glow behind it and a shadow that shrinks as it floats up
  if (uEth.w > 0.5) {
    float bob = sin(uTime * 0.9);
    vec2 e = (px - uEth.xy) / vec2(uEth.z * 0.95, uEth.z * 1.25);
    v += (0.13 + 0.04 * sin(uTime * 0.7)) * exp(-dot(e, e) * 1.6);
    vec2 s = (px - vec2(uEth.x, uEth.y - uEth.z * 1.45)) / vec2(uEth.z * (0.52 - bob * 0.06), uEth.z * 0.075);
    v -= 0.14 * (1.0 - smoothstep(0.55, 1.0, length(s))) * (0.85 - bob * 0.15);
  }

  // moon halo (breathes); the disc itself is drawn below
  vec2 mp = px - uMoon.xy;
  float md = length(mp);
  float breath = 0.5 + 0.5 * sin(uTime * 0.85);
  v += (0.10 + 0.08 * breath) * exp(-max(md - uMoon.z, 0.0) / (uMoon.z * (0.75 + 0.25 * breath)));

  // ordered-dither quantization to the palette
  v = clamp(v, 0.0, 0.999);
  float q = v * 5.0;
  float idx = floor(q) + step(th, fract(q));
  vec3 col = pal(idx);

  // verdict wave: an expanding ring from the checker plus a tint that fades (dithered in, like everything else)
  if (uWave.w > 0.0) {
    float r = uWave.z * length(uRes) * 1.05;
    float d = length(px - uWave.xy);
    float ring = smoothstep(0.25, 0.6, exp(-abs(d - r) / 22.0)) * (1.0 - uWave.z * 0.5);
    float mask = clamp((ring + 0.3 * (1.0 - uWave.z) * step(d, r)) * uWave.w, 0.0, 1.0);
    vec3 alt = uWaveKind < 0.5 ? palRed(idx) : palGreen(idx);
    col = mix(col, alt, step(fract(th + 0.37), mask));
  }

  // pixel stars that twinkle (some grow a 4-point cross when bright)
  vec2 g = floor(px / 15.0);
  float h = hash(g);
  if (h > 0.952) {
    vec2 sp = g * 15.0 + 2.0 + floor(vec2(hash(g + 3.1), hash(g + 7.7)) * 11.0);
    vec2 d = abs(floor(px) - sp);
    float tw = 0.5 + 0.5 * sin(uTime * (0.8 + h * 4.0) + h * 91.0);
    float core = step(d.x + d.y, 0.5);
    float arms = step(d.x + d.y, 1.5) * step(min(d.x, d.y), 0.5) * step(0.72, tw) * step(0.985, h);
    col = mix(col, vec3(1.0), max(core * (0.35 + 0.65 * tw), arms * 0.8));
  }

  // shooting star: a short streak sliding down-left, its tail fading
  if (uShoot.w > 0.5) {
    vec2 dir = normalize(vec2(-1.0, -0.42));
    vec2 head = uShoot.xy + dir * uShoot.z * uRes.x * 0.42;
    float len = 34.0;
    vec2 rel = px - head;
    float along = -dot(rel, dir);
    float across = abs(rel.x * dir.y - rel.y * dir.x);
    float k = (1.0 - clamp(along / len, 0.0, 1.0)) * step(0.0, along) * step(along, len) * step(across, 0.75);
    float fade = sin(uShoot.z * 3.14159);
    col = mix(col, vec3(1.0, 0.98, 0.94), step(th * 0.9, k * fade));
  }

  // crescent moon: lit from the lower left, dithered between two creams
  float inMoon = step(md, uMoon.z) * step(uMoon.z * 0.8, length(mp - vec2(0.44, 0.32) * uMoon.z));
  if (inMoon > 0.5) {
    float lit = 0.55 + 0.45 * dot(normalize(mp + 0.001), vec2(-0.7071, -0.7071)) * 0.6;
    vec3 moon = mix(vec3(0.800, 0.780, 0.961), vec3(0.957, 0.949, 1.0), step(th, lit));
    col = moon;
  }

  gl_FragColor = vec4(col, 1.0);
}
`

const VERT_ETH = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec3 aBary;
uniform vec4 uXf;   // cx, cy (NDC), scale (NDC y per model unit), aspect (w/h)
uniform vec2 uRot;  // yaw, pitch
varying vec3 vN;
varying vec3 vB;
vec3 rot(vec3 p) {
  float cy = cos(uRot.x), sy = sin(uRot.x), cp = cos(uRot.y), sp = sin(uRot.y);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  return vec3(p.x, cp * p.y - sp * p.z, sp * p.y + cp * p.z);
}
void main() {
  vec3 p = rot(aPos);
  vN = rot(aNor);
  vB = aBary;
  float k = 1.0 / (1.0 - p.z * 0.14);
  gl_Position = vec4(uXf.x + p.x * k * uXf.z / uXf.w, uXf.y + p.y * k * uXf.z, -p.z * 0.2, 1.0);
}
`

const FRAG_ETH = `
precision mediump float;
uniform vec2 uLight;  // pointer offset, -0.5..0.5
uniform float uAlpha;
varying vec3 vN;
varying vec3 vB;
${BAYER}
void main() {
  float th = bayer8(gl_FragCoord.xy);
  if (th >= uAlpha) discard; // screen-door transparency keeps the pixel look
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.55 + uLight.x * 0.9, 0.65 - uLight.y * 0.6, 0.75));
  float dif = dot(n, L) * 0.5 + 0.5;
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 10.0);
  float v = clamp(dif * dif * 0.78 + spec * 0.38, 0.0, 0.999) * 6.0;
  float i = floor(v) + step(th, fract(v));
  // facet edges catch the light: one band brighter, so the low-poly cut reads at pixel size
  float edge = step(min(vB.x, min(vB.y, vB.z)), 0.035);
  i = min(6.0, i + edge * 2.0);
  vec3 c = vec3(0.180, 0.161, 0.553);
  c = mix(c, vec3(0.231, 0.220, 0.690), step(0.5, i));
  c = mix(c, vec3(0.310, 0.298, 0.788), step(1.5, i));
  c = mix(c, vec3(0.416, 0.435, 0.878), step(2.5, i));
  c = mix(c, vec3(0.561, 0.612, 0.953), step(3.5, i));
  c = mix(c, vec3(0.663, 0.702, 0.969), step(4.5, i));
  c = mix(c, vec3(0.910, 0.922, 1.000), step(5.5, i));
  gl_FragColor = vec4(c, 1.0);
}
`

/** The ETH logo as a low-poly solid: an upper bipyramid and a lower chevron. Per vertex: position, flat normal, barycentric. */
export function ethMesh(): Float32Array {
  type V = [number, number, number]
  const out: number[] = []
  const ring = (y: number, r: number): V[] => [0, 1, 2, 3].map((i) => [Math.cos((i * Math.PI) / 2) * r, y, Math.sin((i * Math.PI) / 2) * r])
  const tri = (a: V, b: V, c: V, center: V): void => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!]
    const fc = [(a[0] + b[0] + c[0]) / 3 - center[0], (a[1] + b[1] + c[1]) / 3 - center[1], (a[2] + b[2] + c[2]) / 3 - center[2]]
    if (n[0]! * fc[0]! + n[1]! * fc[1]! + n[2]! * fc[2]! < 0) n = n.map((x) => -x)
    const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1
    const bary = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]
    ;[a, b, c].forEach((v, k) => out.push(v[0], v[1], v[2], n[0]! / l, n[1]! / l, n[2]! / l, ...bary[k]!))
  }
  // upper body
  const top: V = [0, 1.05, 0]
  const mid = ring(-0.1, 0.66)
  const low: V = [0, -0.42, 0]
  for (let i = 0; i < 4; i++) {
    const a = mid[i]!
    const b = mid[(i + 1) % 4]!
    tri(top, a, b, [0, 0.1, 0])
    tri(low, b, a, [0, 0.1, 0])
  }
  // lower chevron: a concave top (its centre dips) and a pyramid down to the tip
  const rim = ring(-0.58, 0.66)
  const dip: V = [0, -0.84, 0]
  const tip: V = [0, -1.38, 0]
  for (let i = 0; i < 4; i++) {
    const a = rim[i]!
    const b = rim[(i + 1) % 4]!
    tri(dip, b, a, [0, -1.6, 0])
    tri(tip, a, b, [0, -0.95, 0])
  }
  return new Float32Array(out)
}

export interface Wallpaper {
  /** Verdict feedback: one red pulse, or a green wave. `from` is where it starts (the checker window). */
  wave(kind: 'red' | 'green', from?: DOMRect): void
  pause(): void
  resume(): void
}

function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const prog = gl.createProgram()
  if (!prog) return null
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const sh = gl.createShader(type)
    if (!sh) return null
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[exe wallpaper]', gl.getShaderInfoLog(sh))
      return null
    }
    gl.attachShader(prog, sh)
  }
  gl.linkProgram(prog)
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null
}

/** CSS fallback pulse (phones / no WebGL): the .wall::before tint flashes once. */
function cssWave(kind: 'red' | 'green'): void {
  const wall = document.querySelector<HTMLElement>('.wall')
  if (!wall || calm.matches || typeof wall.animate !== 'function') return
  const c = kind === 'red' ? 'rgb(196 22 28 / .42)' : 'rgb(60 230 140 / .32)'
  try {
    wall.animate(
      [
        { opacity: 0, background: `radial-gradient(70% 60% at 50% 30%, ${c}, transparent 70%)` },
        { opacity: 1, offset: 0.18 },
        { opacity: 0, background: `radial-gradient(70% 60% at 50% 30%, ${c}, transparent 70%)` },
      ],
      { duration: 1500, easing: 'ease-out', pseudoElement: '::before' },
    )
  } catch {
    /* pseudo-element animation unsupported: no pulse */
  }
}

export function mountWallpaper(): Wallpaper {
  const fallback: Wallpaper = { wave: cssWave, pause() {}, resume() {} }
  const wall = document.querySelector<HTMLElement>('.wall')
  if (!wall || !wide.matches) {
    // phones keep the CSS wallpaper; if the window grows into a desktop, the next load gets the GL one
    return fallback
  }
  const canvas = document.createElement('canvas')
  canvas.className = 'wallgl'
  canvas.setAttribute('aria-hidden', 'true')
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: true, powerPreference: 'low-power', preserveDrawingBuffer: false })
  if (!gl) return fallback
  const pWall = compile(gl, VERT_QUAD, FRAG_WALL)
  const pEth = compile(gl, VERT_ETH, FRAG_ETH)
  if (!pWall || !pEth) return fallback

  wall.before(canvas)
  document.documentElement.classList.add('has-gl')

  // ---- buffers
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const mesh = ethMesh()
  const ethBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, ethBuf)
  gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW)
  const ethCount = mesh.length / 9

  const U = (p: WebGLProgram, names: string[]): Record<string, WebGLUniformLocation | null> =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const uw = U(pWall, ['uRes', 'uTime', 'uMouse', 'uMoon', 'uEth', 'uWave', 'uWaveKind', 'uShoot', 'uCheck'])
  const ue = U(pEth, ['uXf', 'uRot', 'uLight', 'uAlpha'])
  const aQuad = gl.getAttribLocation(pWall, 'aPos')
  const aPos = gl.getAttribLocation(pEth, 'aPos')
  const aNor = gl.getAttribLocation(pEth, 'aNor')
  const aBary = gl.getAttribLocation(pEth, 'aBary')

  // ---- layout: the moon and the ETH keep their CSS-driven slots (the SVGs stay in the layout, invisible)
  const moonEl = wall.querySelector<SVGElement>('.wall__moon')
  const ethEl = wall.querySelector<SVGElement>('.wall__eth')
  let W = 1
  let H = 1
  let moon: [number, number, number] = [-999, -999, 1]
  let eth = { x: -999, y: -999, h: 1, alpha: 1, on: false }
  const measure = (): void => {
    const vw = document.documentElement.clientWidth
    const vh = innerHeight
    const w = Math.max(1, Math.ceil(vw / CELL))
    const h = Math.max(1, Math.ceil(vh / CELL))
    if (w !== W || h !== H) {
      W = canvas.width = w
      H = canvas.height = h
    }
    if (moonEl) {
      const r = moonEl.getBoundingClientRect()
      // the SVG crescent's disc is ~92 % of its box, centred slightly low-left
      moon = [(r.left + r.width * 0.47) / CELL, H - (r.top + r.height * 0.52) / CELL, (r.width * 0.46) / CELL]
    }
    if (ethEl) {
      const r = ethEl.getBoundingClientRect()
      const op = Number(getComputedStyle(ethEl).opacity) || 1
      eth = {
        x: (r.left + r.width / 2) / CELL,
        y: H - (r.top + r.height * 0.47) / CELL,
        h: (r.height * 0.5) / CELL,
        alpha: op,
        on: r.width > 0 && r.bottom > -40 && r.top < vh + 40,
      }
    }
  }

  // ---- input
  const mouse = { x: 0, y: 0, tx: 0, ty: 0, on: 0, ton: 0, seen: 0 }
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return
      mouse.tx = e.clientX / CELL
      mouse.ty = H - e.clientY / CELL
      if (!mouse.seen) {
        mouse.x = mouse.tx
        mouse.y = mouse.ty
      }
      mouse.seen = performance.now()
      mouse.ton = 1
      kick()
    },
    { passive: true },
  )
  document.documentElement.addEventListener('pointerleave', () => (mouse.ton = 0))

  // ---- effects state
  let waveT0 = -1
  let waveKind = 0
  let waveO: [number, number] = [0, 0]
  let shootT0 = -1
  let shootAt = 4000 + Math.random() * 5000
  let shootO: [number, number] = [0, 0]

  // ---- loop
  let raf = 0
  let running = false
  let paused = false
  let last = performance.now()
  let t = 14 // seconds of plasma time; starts mid-flow so the first frame is already interesting
  const STILL_T = 14

  function draw(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const still = calm.matches
    if (!still) t += dt
    // pointer smoothing (frame-rate independent)
    const k = 1 - Math.exp(-dt * 6)
    mouse.x += (mouse.tx - mouse.x) * k
    mouse.y += (mouse.ty - mouse.y) * k
    if (now - mouse.seen > 4000) mouse.ton = 0
    mouse.on += (mouse.ton - mouse.on) * (1 - Math.exp(-dt * 2.5))

    gl!.viewport(0, 0, W, H)
    gl!.disable(gl!.DEPTH_TEST)
    gl!.useProgram(pWall)
    gl!.bindBuffer(gl!.ARRAY_BUFFER, quad)
    gl!.enableVertexAttribArray(aQuad)
    gl!.vertexAttribPointer(aQuad, 2, gl!.FLOAT, false, 0, 0)
    gl!.uniform2f(uw.uRes!, W, H)
    gl!.uniform1f(uw.uTime!, still ? STILL_T : t)
    gl!.uniform3f(uw.uMouse!, mouse.x, mouse.y, still ? 0 : mouse.on)
    gl!.uniform3f(uw.uMoon!, moon[0], moon[1], moon[2])
    gl!.uniform4f(uw.uEth!, eth.x, eth.y, eth.h, eth.on ? 1 : 0)
    gl!.uniform1f(uw.uCheck!, 48 / CELL)
    // verdict wave: 1.6 s, eased
    let wp = 0
    let wa = 0
    if (waveT0 >= 0) {
      const e = (now - waveT0) / 1600
      if (e >= 1) waveT0 = -1
      else {
        wp = 1 - (1 - e) ** 2.2
        wa = Math.min(1, e * 8) * (1 - e) ** 0.7
      }
    }
    gl!.uniform4f(uw.uWave!, waveO[0], waveO[1], wp, wa)
    gl!.uniform1f(uw.uWaveKind!, waveKind)
    // shooting star: every 7-16 s, 0.9 s long, somewhere in the upper half
    let sp = 0
    if (!still) {
      if (shootT0 < 0 && now > shootAt) {
        shootT0 = now
        shootO = [W * (0.45 + Math.random() * 0.5), H * (0.62 + Math.random() * 0.33)]
      }
      if (shootT0 >= 0) {
        sp = (now - shootT0) / 900
        if (sp >= 1) {
          shootT0 = -1
          sp = 0
          shootAt = now + 7000 + Math.random() * 9000
        }
      }
    }
    gl!.uniform4f(uw.uShoot!, shootO[0], shootO[1], sp, sp > 0 ? 1 : 0)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    gl!.disableVertexAttribArray(aQuad)

    if (eth.on) {
      const tt = still ? STILL_T : t
      const mx = mouse.on * (mouse.x / W - 0.5)
      const my = mouse.on * (0.5 - mouse.y / H)
      gl!.enable(gl!.DEPTH_TEST)
      gl!.clear(gl!.DEPTH_BUFFER_BIT)
      gl!.useProgram(pEth)
      gl!.bindBuffer(gl!.ARRAY_BUFFER, ethBuf)
      gl!.enableVertexAttribArray(aPos)
      gl!.enableVertexAttribArray(aNor)
      gl!.enableVertexAttribArray(aBary)
      gl!.vertexAttribPointer(aPos, 3, gl!.FLOAT, false, 36, 0)
      gl!.vertexAttribPointer(aNor, 3, gl!.FLOAT, false, 36, 12)
      gl!.vertexAttribPointer(aBary, 3, gl!.FLOAT, false, 36, 24)
      const scale = (eth.h / 1.25) * (2 / H)
      const bob = Math.sin(tt * 0.9) * eth.h * 0.07
      const cx = (eth.x - mx * 10) / W * 2 - 1
      const cy = (eth.y + bob + my * 6) / H * 2 - 1
      gl!.uniform4f(ue.uXf!, cx, cy + 0.165 * scale, scale, W / H)
      gl!.uniform2f(ue.uRot!, 0.62 + tt * 0.45 + mx * 0.9, -0.16 + my * 0.35 + Math.sin(tt * 0.6) * 0.05)
      gl!.uniform2f(ue.uLight!, mx, my)
      gl!.uniform1f(ue.uAlpha!, eth.alpha)
      gl!.drawArrays(gl!.TRIANGLES, 0, ethCount)
      gl!.disableVertexAttribArray(aPos)
      gl!.disableVertexAttribArray(aNor)
      gl!.disableVertexAttribArray(aBary)
    }
  }

  const frame = (now: number): void => {
    raf = 0
    if (!running) return
    draw(now)
    if (!calm.matches || waveT0 >= 0) raf = requestAnimationFrame(frame)
  }
  function start(): void {
    if (paused || document.hidden) return
    running = true
    last = performance.now()
    if (!raf) raf = requestAnimationFrame(frame)
  }
  function stop(): void {
    running = false
    cancelAnimationFrame(raf)
    raf = 0
  }
  /** Reduced motion: a still frame, redrawn only when something changes. */
  function kick(): void {
    if (calm.matches && running && !raf) raf = requestAnimationFrame(frame)
  }

  let measureRaf = 0
  const remeasure = (): void => {
    if (measureRaf) return
    measureRaf = requestAnimationFrame(() => {
      measureRaf = 0
      measure()
      kick()
    })
  }
  measure()
  addEventListener('resize', remeasure, { passive: true })
  addEventListener('scroll', remeasure, { passive: true })
  // fonts / intro can move the hero and so the ETH slot
  new ResizeObserver(remeasure).observe(document.body)
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
  calm.addEventListener('change', () => {
    stop()
    start()
  })
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    stop()
    canvas.remove()
    document.documentElement.classList.remove('has-gl')
  })
  start()
  draw(performance.now()) // first frame synchronously: no flash of the CSS wallpaper

  return {
    wave(kind, from) {
      if (!document.documentElement.classList.contains('has-gl')) return cssWave(kind)
      if (calm.matches) return
      waveKind = kind === 'red' ? 0 : 1
      const r = from ?? new DOMRect(innerWidth / 2, innerHeight / 2, 0, 0)
      waveO = [(r.left + r.width / 2) / CELL, H - (r.top + Math.min(r.height, innerHeight) / 2) / CELL]
      waveT0 = performance.now()
      kick()
      if (!raf && running) raf = requestAnimationFrame(frame)
    },
    pause() {
      paused = true
      stop()
    },
    resume() {
      paused = false
      start()
    },
  }
}

/** A short shower of pixel emeralds behind the windows (green verdict). Works with or without WebGL. */
export function gemRain(): void {
  if (calm.matches) return
  const layer = document.createElement('div')
  layer.className = 'rain'
  layer.setAttribute('aria-hidden', 'true')
  const gem =
    '<svg viewBox="0 0 20 20" shape-rendering="crispEdges"><path d="M6 1h8l5 5v8l-5 5H6l-5-5V6z" fill="#3ce68c" stroke="#0f5a33" stroke-width="1.6"/><path d="M7 5h6l2 2v6l-2 2H7l-2-2V7z" fill="#8ff5bd"/><path d="M7.5 6.5h3l1 1" stroke="#fff" stroke-width="1.4" fill="none"/></svg>'
  const n = innerWidth < 600 ? 12 : 26
  const anims: Promise<unknown>[] = []
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span')
    s.innerHTML = gem
    const size = 12 + Math.round(Math.random() * 3) * 4
    s.style.cssText = `left:${(Math.random() * 100).toFixed(2)}%;width:${size}px;height:${size}px`
    layer.append(s)
    const dur = 1100 + Math.random() * 900
    const spin = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 270)
    anims.push(
      s
        .animate(
          [
            { transform: 'translateY(-40px) rotate(0deg)', opacity: 1 },
            { transform: `translateY(${innerHeight * 0.8}px) rotate(${spin * 0.8}deg)`, opacity: 1, offset: 0.8 },
            { transform: `translateY(${innerHeight + 40}px) rotate(${spin}deg)`, opacity: 0 },
          ],
          { duration: dur, delay: Math.random() * 700, easing: 'cubic-bezier(.45,.05,.75,.6)', fill: 'backwards' },
        )
        .finished.catch(() => {}),
    )
  }
  ;(document.querySelector('.wallgl') ?? document.querySelector('.wall'))?.after(layer)
  void Promise.all(anims).then(() => layer.remove())
}
