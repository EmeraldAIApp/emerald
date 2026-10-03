// X (Twitter) weighted length, twitter-text v3 rules: a URL counts 23; code points in the Latin/punctuation ranges
// count 1; everything else (emoji, CJK) counts 2. Emoji sequences are counted per code point (conservative).
const URL_RE = /\bhttps?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|app|xyz|io|fun|eth|limo|ai|org|net|dev|so|cash)\b(?:\/\S*)?/gi

export const X_MAX = 280
export const X_URL = 23

export function xLength(text: string): number {
  let n = 0
  const rest = text.replace(URL_RE, () => {
    n += X_URL
    return ''
  })
  for (const ch of rest) {
    const cp = ch.codePointAt(0)!
    const light = cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247)
    n += light ? 1 : 2
  }
  return n
}
