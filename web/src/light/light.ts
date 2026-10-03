// The verdict light (brief §7). The ENGINE decides the level; this only paints it on the photo.
import type { Level } from '../chat/wire.js'

export type LightLevel = 'idle' | Level

/** Same numbers as LAYER in scripts/light-mask.py (web/test/light.test.ts checks it). */
export const LIGHT: Record<LightLevel, { c: string; mul: number; glow: number }> = {
  idle: { c: 'var(--dv-ink)', mul: 1, glow: 0.22 },
  yellow: { c: 'var(--amber)', mul: 1, glow: 0.3 },
  red: { c: 'var(--alert)', mul: 1, glow: 0.28 },
  green: { c: 'var(--emerald)', mul: 0.85, glow: 0.18 },
}

const set = (el: HTMLElement, k: string, v: string | number) => el.style.setProperty(k, String(v))

/** Instant change (reduced-motion, and the only path until the Task 20 motion pass). */
export function setLightInstant(stage: HTMLElement, level: LightLevel): void {
  const L = LIGHT[level]
  set(stage, '--c-prev', L.c)
  set(stage, '--mul-prev', L.mul)
  set(stage, '--glow-prev', L.glow)
  set(stage, '--c-next', L.c)
  set(stage, '--mul-next', 0)
  set(stage, '--glow-next', 0)
}

/** Marks the stage ready once the plate decoded (fail-open after 2.5 s). Avoids light blotches over navy. */
export function readyWhenDecoded(stage: HTMLElement): void {
  const img = stage.querySelector('img')
  const ready = () => stage.classList.add('is-ready')
  if (!img) return ready()
  const loaded = img.complete ? Promise.resolve() : new Promise((r) => img.addEventListener('load', r, { once: true }))
  loaded.then(() => img.decode()).then(ready, ready)
  setTimeout(ready, 2500)
}
