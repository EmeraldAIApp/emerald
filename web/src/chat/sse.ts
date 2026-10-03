// Incremental text/event-stream parser (network chunks cut frames at any byte).
export interface SseFrame { event: string; data: string }

function parseBlock(block: string): SseFrame | null {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return data.length > 0 ? { event, data: data.join('\n') } : null
}

export class SseParser {
  private buf = ''

  push(chunk: string): SseFrame[] {
    // \r\n -> \n across the whole buffer (a \r at the end of a chunk waits for its \n); a lone \r -> \n
    this.buf = (this.buf + chunk).replace(/\r\n/g, '\n').replace(/\r(?!$)/g, '\n')
    const out: SseFrame[] = []
    let i = this.buf.indexOf('\n\n')
    while (i >= 0) {
      const frame = parseBlock(this.buf.slice(0, i))
      if (frame) out.push(frame)
      this.buf = this.buf.slice(i + 2)
      i = this.buf.indexOf('\n\n')
    }
    return out
  }

  flush(): SseFrame[] {
    const rest = this.buf.replace(/\r$/, '')
    this.buf = ''
    const frame = rest.trim() ? parseBlock(rest) : null
    return frame ? [frame] : []
  }
}
