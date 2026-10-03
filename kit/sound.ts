// Sound for the X clips. A soft chiptune bed is synthesized here (own asset, no license), the sound effects come from
// kit/sfx/ (Pixabay Content License, see kit/sfx/CREDITS.md), and ffmpeg mixes both onto each clip, timed to what
// happens on screen. Cue times were read off the recordings (record-room.ts / record-demo.ts keep the same timing).
// Usage: npx tsx kit/sound.ts      (rewrites kit/out/room-boot.mp4, demo-swap.mp4, demo-approval.mp4 with audio)
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'kit/out'
const SFX = 'kit/sfx'
const TMP = join(OUT, 'sound-tmp')
const RATE = 44100

// ---------- the bed: Am F C G at 84 bpm, triangle pad + pulse arpeggio + sine bass, with an echo on the arp ----------
const BPM = 84
const BEAT = 60 / BPM
const BAR = 4 * BEAT
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)
const CHORDS = [
  [57, 60, 64], // A minor
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
]

function bed(seconds: number): Float32Array[] {
  const n = Math.ceil(seconds * RATE)
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  const tri = (ph: number) => 4 * Math.abs(ph - Math.floor(ph + 0.5)) - 1
  const pulse = (ph: number) => (ph - Math.floor(ph) < 0.25 ? 1 : -1)
  let lp = 0 // one-pole low-pass on the arp, so the square reads soft
  const arp = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    const bar = Math.floor(t / BAR)
    const chord = CHORDS[bar % CHORDS.length]!
    const inBar = t - bar * BAR
    // pad: three chord tones an octave up, slow swell per bar, light vibrato
    const swell = Math.min(1, inBar / 0.6) * (1 - 0.35 * Math.max(0, (inBar - BAR + 0.5) / 0.5))
    let pad = 0
    for (const [k, note] of chord.entries()) {
      const f = midi(note + 12) * (1 + 0.003 * Math.sin(2 * Math.PI * (4.5 + k) * t))
      pad += tri(f * t + k * 0.13)
    }
    pad *= 0.055 * swell
    // bass: root on every beat, plucked
    const inBeat = t % BEAT
    const bass = 0.16 * Math.sin(2 * Math.PI * midi(chord[0]! - 12) * t) * Math.exp(-inBeat * 3.2)
    // arp: eighth notes up the chord, two octaves up
    const step = Math.floor(t / (BEAT / 2))
    const inStep = t % (BEAT / 2)
    const note = chord[step % 3]! + (step % 6 < 3 ? 24 : 12)
    const raw = pulse(midi(note) * t) * Math.exp(-inStep * 7) * 0.05
    lp += 0.18 * (raw - lp)
    arp[i] = lp
    L[i] = pad + bass
    R[i] = pad + bass
  }
  // echo on the arp (dotted eighth), panned slightly apart
  const d = Math.round(BEAT * 0.75 * RATE)
  for (let i = 0; i < n; i++) {
    const e = i >= d ? arp[i - d]! * 0.45 : 0
    const e2 = i >= 2 * d ? arp[i - 2 * d]! * 0.2 : 0
    L[i]! += arp[i]! * 0.9 + e2
    R[i]! += arp[i]! * 0.7 + e
  }
  // fades and peak normalize to -6 dBFS
  const fade = Math.round(0.8 * RATE)
  let peak = 0
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / fade, (n - 1 - i) / fade)
    L[i]! *= g
    R[i]! *= g
    peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!))
  }
  const k = 0.5 / (peak || 1)
  for (let i = 0; i < n; i++) {
    L[i]! *= k
    R[i]! *= k
  }
  return [L, R]
}

function writeWav(file: string, [L, R]: Float32Array[]): void {
  const n = L!.length
  const buf = Buffer.alloc(44 + n * 4)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 4, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 4, 28)
  buf.writeUInt16LE(4, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L![i]!)) * 32767), 44 + i * 4)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R![i]!)) * 32767), 46 + i * 4)
  }
  writeFileSync(file, buf)
}

// ---------- cues ----------
interface Cue {
  file: string
  at: number // seconds into the clip
  vol: number
  dur?: number // cut the effect at this length (with a short fade)
}
interface Clip {
  name: string
  musicFrom: number // the bed starts here (the room is quiet until the CRT turns on)
  musicVol: number
  wind?: boolean // snowy-night room tone before the PC turns on
  cues: Cue[]
}

const CLIPS: Clip[] = [
  {
    // 0-2.7 s the room at night; 2.7 power; 3.0 CRT on; 3.5-6.0 boot text types; 6.8 dive; 8.4 desktop
    name: 'room-boot',
    musicFrom: 3.0,
    musicVol: 0.85,
    wind: true,
    cues: [
      { file: 'click.mp3', at: 2.65, vol: 0.9 },
      { file: 'impact-bass-1.mp3', at: 2.85, vol: 0.22, dur: 1.2 },
      { file: 'glitch-3.mp3', at: 2.9, vol: 0.25, dur: 0.7 },
      { file: 'typing.mp3', at: 3.5, vol: 0.12, dur: 2.6 },
      { file: 'whoosh-cinematic.mp3', at: 6.5, vol: 0.9 },
      { file: 'sparkle.mp3', at: 8.3, vol: 0.8 },
    ],
  },
  ...['demo-swap', 'demo-approval'].map(
    (name): Clip => ({
      // 1.9 s click on the sample; 2.0 reading (the 5 checks run); 2.5 green verdict and the emerald shower
      name,
      musicFrom: 0,
      musicVol: 0.45,
      cues: [
        { file: 'click-soft.mp3', at: 1.85, vol: 1 },
        { file: 'typing.mp3', at: 2.0, vol: 0.1, dur: 0.5 },
        { file: 'chime.mp3', at: 2.5, vol: 1.3 },
        { file: 'sparkle.mp3', at: 2.6, vol: 0.8 },
      ],
    }),
  ),
]

const duration = (file: string): number =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
try {
  const bedFile = join(TMP, 'bed.wav')
  writeWav(bedFile, bed(16))
  for (const c of CLIPS) {
    const video = join(OUT, `${c.name}.mp4`)
    const silent = join(TMP, `${c.name}-silent.mp4`)
    // always start from the picture alone, so re-running never stacks audio
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-map', '0:v', '-c', 'copy', silent])
    const len = duration(silent)
    const inputs = ['-i', silent, '-i', bedFile, ...c.cues.flatMap((q) => ['-i', join(SFX, q.file)])]
    const parts: string[] = []
    const labels: string[] = []
    const ms = (s: number) => Math.round(s * 1000)
    parts.push(
      `[1:a]atrim=0:${(len - c.musicFrom).toFixed(3)},afade=t=in:d=0.6,afade=t=out:st=${(len - c.musicFrom - 1.2).toFixed(3)}:d=1.2,` +
        `volume=${c.musicVol},adelay=${ms(c.musicFrom)}|${ms(c.musicFrom)}[m]`,
    )
    labels.push('[m]')
    c.cues.forEach((q, i) => {
      const cut = q.dur ? `atrim=0:${q.dur},afade=t=out:st=${Math.max(0, q.dur - 0.25)}:d=0.25,` : ''
      parts.push(`[${i + 2}:a]${cut}aformat=channel_layouts=stereo,volume=${q.vol},adelay=${ms(q.at)}|${ms(q.at)}[s${i}]`)
      labels.push(`[s${i}]`)
    })
    if (c.wind) {
      // brown noise through a low-pass: wind against the window, gone once the PC is on
      parts.push(
        `anoisesrc=color=brown:amplitude=0.5:r=${RATE}:d=${len.toFixed(3)},lowpass=f=420,aformat=channel_layouts=stereo,` +
          `volume='0.4*(1-0.6*clip((t-2.6)/1.2,0,1))':eval=frame,afade=t=in:d=0.8[w]`,
      )
      labels.push('[w]')
    }
    parts.push(
      `${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,atrim=0:${len.toFixed(3)},` +
        `alimiter=limit=0.89,loudnorm=I=-16:TP=-1.5:LRA=11[a]`,
    )
    const out = join(TMP, `${c.name}.mp4`)
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', String(RATE), '-shortest', '-movflags', '+faststart', out])
    copyFileSync(out, video)
    console.log(`${video}  ${len.toFixed(1)} s, ${c.cues.length} effects`)
  }
} finally {
  rmSync(TMP, { recursive: true, force: true })
}
