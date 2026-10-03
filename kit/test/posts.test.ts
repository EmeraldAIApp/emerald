import { describe, expect, it } from 'vitest'
import { POSTS, PROFILE, WORST_CASE, renderPost } from '../posts.js'
import { X_MAX, xLength } from '../xlen.js'

describe('xLength', () => {
  it('counts a URL as 23 whatever its length', () => {
    expect(xLength('https://a.co')).toBe(23)
    expect(xLength('https://etherscan.io/tx/0x' + 'f'.repeat(64))).toBe(23)
  })
  it('counts bare domains as URLs too', () => {
    expect(xLength('see emerald.app now')).toBe(4 + 23 + 4)
  })
  it('counts emoji as 2 and Latin as 1', () => {
    expect(xLength('🔴')).toBe(2)
    expect(xLength('é·’')).toBe(3)
  })
})

describe('X kit posts', () => {
  it('has 5 to 18 posts with unique ids (the pinned one, the pre-launch batches, the launch and post-launch posts)', () => {
    expect(POSTS.length).toBeGreaterThanOrEqual(5)
    expect(POSTS.length).toBeLessThanOrEqual(18)
    expect(new Set(POSTS.map((p) => p.id)).size).toBe(POSTS.length)
  })
  for (const p of POSTS) {
    it(`${p.id}: fits in ${X_MAX} with worst-case values`, () => {
      expect(xLength(renderPost(p, WORST_CASE))).toBeLessThanOrEqual(X_MAX)
    })
    it(`${p.id}: follows the copy rules`, () => {
      expect(p.text).not.toMatch(/[—–]/) // no em/en dash (brief §6)
      expect(p.text.toLowerCase()).not.toContain('vitalik.eth') // never the book's domain as ours
      expect(p.text).not.toMatch(/\b(guaranteed?|100x|moon soon|financial advice)\b/i)
      expect(p.text).not.toMatch(/(?<!not )\baudited\b/i) // "Not audited." is fine, a claim of an audit is not
      // copy-v2: no character voice, Emerald is named in the third person
      // (the engine's own-CA headline "This is me." may be quoted as what the site shows)
      expect(p.text.replace('"This is me."', '')).not.toMatch(/\b(I|I'm|I'll|I've|me|my)\b/)
      expect(p.text).not.toContain('Rules decide. I explain.')
    })
  }
  it('never shows the CA nor the ticker before the launch phase, and says "CA: soon" instead', () => {
    for (const p of POSTS.filter((x) => x.phase === 'pre')) {
      expect(p.text).not.toContain('{CA}')
      expect(p.text).not.toContain('$EMERALD')
      expect(p.text).toContain('CA: soon')
    }
  })
  it('shows the CA in every post after the launch', () => {
    for (const p of POSTS.filter((x) => x.phase !== 'pre')) expect(p.text).toContain('CA: {CA}')
  })
  it('opens the launch post with the news, and pins a post that says what Emerald does', () => {
    expect(POSTS.find((p) => p.id === 'launch')!.text.startsWith('$EMERALD is live.')).toBe(true)
    expect(POSTS[0]!.id).toBe('pinned')
  })
  it('says the fee split right: 2 % total, 1 % for the checks, 1 % for Stockereum', () => {
    const fees = POSTS.find((p) => p.id === 'fees')!.text
    expect(fees).toContain('2 % fee per trade')
    expect(fees).toContain('1 % pays for the checks')
    expect(fees).toContain('1 % goes to Stockereum')
  })
  it('says "Not affiliated with Vitalik Buterin." in every post that cites the book, in the launch post and in the bio', () => {
    for (const p of POSTS.filter((x) => /Snowmoon|Vitalik/.test(x.text) || x.id === 'launch'))
      expect(p.text).toContain('Not affiliated with Vitalik Buterin.')
    expect(PROFILE.bio).toContain('Not affiliated with Vitalik Buterin.')
  })
  it('keeps the bio within 160 characters', () => {
    expect(PROFILE.bio.length).toBeLessThanOrEqual(160)
  })
  it('renderPost fills the variables and refuses to leave one empty', () => {
    const launch = POSTS.find((p) => p.id === 'launch')!
    expect(renderPost(launch, WORST_CASE)).toContain(`CA: ${WORST_CASE.CA}`)
    expect(() => renderPost(launch, { SITE: 'https://x.test' })).toThrow('post launch: missing {CA}')
  })
})
