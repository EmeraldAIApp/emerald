// Optional UI sounds for Emerald.exe (/) (off by default, remembered per browser). Synthesized with WebAudio: no audio files.
type Cue = 'open' | 'close' | 'click' | 'alert' | 'ok' | 'boot'

const KEY = 'emerald.exe.sound'
let on = false
let ctx: AudioContext | undefined

try {
  on = localStorage.getItem(KEY) === '1'
} catch {
  /* storage blocked: stays off */
}

export const soundOn = (): boolean => on

export function setSound(v: boolean): void {
  on = v
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (v) sfx('click')
}

// [frequency Hz, start s, duration s, wave]
const CUES: Record<Cue, [number, number, number, OscillatorType][]> = {
  open: [[523, 0, 0.06, 'square'], [784, 0.05, 0.08, 'square']],
  close: [[659, 0, 0.05, 'square'], [392, 0.04, 0.08, 'square']],
  click: [[1200, 0, 0.025, 'square']],
  alert: [[880, 0, 0.11, 'square'], [880, 0.16, 0.11, 'square'], [660, 0.32, 0.2, 'square']],
  ok: [[659, 0, 0.07, 'triangle'], [988, 0.07, 0.14, 'triangle']],
  boot: [[392, 0, 0.12, 'triangle'], [523, 0.1, 0.12, 'triangle'], [784, 0.2, 0.3, 'triangle']],
}

export function sfx(cue: Cue): void {
  if (!on) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const t0 = ctx.currentTime + 0.01
    for (const [f, at, dur, type] of CUES[cue]) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = type
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + at)
      g.gain.exponentialRampToValueAtTime(0.06, t0 + at + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur)
      o.connect(g).connect(ctx.destination)
      o.start(t0 + at)
      o.stop(t0 + at + dur + 0.02)
    }
  } catch {
    /* no audio: silent */
  }
}
