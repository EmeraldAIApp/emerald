// Pure helpers for the demo recording: read the /api/chat SSE stream and turn screencast frames into an ffmpeg list.
import { basename } from 'node:path'

export interface SseEvent {
  event: string
  data: unknown
}

/** Parses a text/event-stream body (`event:` + `data:` lines, frames separated by a blank line). */
export function parseSse(text: string): SseEvent[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .map((frame) => {
      let event = 'message'
      let data = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7)
        else if (line.startsWith('data: ')) data += line.slice(6)
      }
      return data ? { event, data: JSON.parse(data) as unknown } : null
    })
    .filter((e): e is SseEvent => e !== null)
}

export interface DemoVerdict {
  level: string
  headline: string
  input: { kind: string }
}

/** The `verdict` event of a /api/chat stream (contract: the engine's Verdict, bigints as strings). */
export function verdictFromSse(text: string): DemoVerdict {
  const ev = parseSse(text).find((e) => e.event === 'verdict')
  if (!ev) throw new Error('no verdict event in the /api/chat stream')
  return ev.data as DemoVerdict
}

export interface Frame {
  file: string
  t: number // CDP screencast metadata.timestamp, seconds
}

/** ffconcat list with the real duration of every frame (screencast only emits frames when something repaints). */
export function concatList(frames: Frame[], endT: number): string {
  if (frames.length === 0) throw new Error('no frames captured')
  const lines = ['ffconcat version 1.0']
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1]!.t : endT
    lines.push(`file '${basename(f.file)}'`, `duration ${Math.max(next - f.t, 0.001).toFixed(3)}`)
  })
  lines.push(`file '${basename(frames.at(-1)!.file)}'`) // ffmpeg needs the last file repeated to honor its duration
  return lines.join('\n') + '\n'
}
