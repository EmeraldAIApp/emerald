// The night as one film: every section has its own light (moon high over the hero, the lamp-less table of the book,
// a violet dawn under the roadmap). The atmosphere blends the tones of whatever sections are on screen, weighted by
// how much of each one is visible, so the fog and the moonbeams change color continuously while scrolling.
import type { LightLevel } from '../light/light.js'

export type Rgb = [number, number, number]

export interface Tone {
  /** Fog where no light reaches it. */
  deep: Rgb
  /** Fog lit by the moon. */
  lit: Rgb
  /** Moonbeam color. */
  ray: Rgb
  /** Violet dawn rising from the bottom of the screen (0..1). */
  dawn: number
  /** Snow density/brightness outside the window (0..1). */
  snow: number
}

const hex = (h: string): Rgb => {
  const n = parseInt(h.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Per section id. Deep tones sit close to --night/--haze, lit tones between --dusk and --eth, the dawn leans on --plum. */
export const TONES: Record<string, Tone> = {
  try: { deep: hex('#120f36'), lit: hex('#4a4fa6'), ray: hex('#b4c0ff'), dawn: 0, snow: 1 },
  lineup: { deep: hex('#0f1036'), lit: hex('#4252a8'), ray: hex('#a9bcff'), dawn: 0, snow: 0.7 },
  book: { deep: hex('#170f33'), lit: hex('#5a4c98'), ray: hex('#c4b8f0'), dawn: 0, snow: 0.55 },
  how: { deep: hex('#110f38'), lit: hex('#4a4aa8'), ray: hex('#b0b4ff'), dawn: 0.1, snow: 0.55 },
  token: { deep: hex('#170c38'), lit: hex('#5a40a0'), ray: hex('#bca8f4'), dawn: 0.35, snow: 0.45 },
  roadmap: { deep: hex('#1d0c34'), lit: hex('#7a4a9e'), ray: hex('#e0b4ec'), dawn: 1, snow: 0.35 },
}
export const DEFAULT_TONE = TONES.try!

/** Weighted blend of section tones; weights need not sum to 1 (they are normalized), and an empty list gives the hero. */
export function blendTones(parts: { id: string; w: number }[]): Tone {
  const known = parts.filter((p) => TONES[p.id] && p.w > 0)
  const total = known.reduce((s, p) => s + p.w, 0)
  if (!total) return DEFAULT_TONE
  const mix = (pick: (t: Tone) => Rgb): Rgb =>
    [0, 1, 2].map((i) => known.reduce((s, p) => s + pick(TONES[p.id]!)[i]! * p.w, 0) / total) as Rgb
  const num = (pick: (t: Tone) => number) => known.reduce((s, p) => s + pick(TONES[p.id]!) * p.w, 0) / total
  return { deep: mix((t) => t.deep), lit: mix((t) => t.lit), ray: mix((t) => t.ray), dawn: num((t) => t.dawn), snow: num((t) => t.snow) }
}

/** The bracelet light colors (same hex as --dv-ink, --amber, --alert, --emerald in tokens.css). */
export const BAND: Record<LightLevel, Rgb> = {
  idle: hex('#7fbcff'),
  yellow: hex('#FFB02E'),
  red: hex('#FF3B2F'),
  green: hex('#3CE68C'),
}
