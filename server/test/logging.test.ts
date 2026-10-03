import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubSources } from '../../engine/test/helpers/stub-sources.js'
import { tierForAddress } from '../access.js'
import { cachedSources } from '../cache.js'
import { makeChatHandler } from '../handlers/chat.js'
import type { Store } from '../redis.js'
import { MemoryStore } from '../redis.js'
import { runVerdict } from '../verdict.js'
import { fakeDeps, parseSse, post } from './helpers.js'

const DRAINER = '0x00001f78189bE22C3498cFF1B8e02272C3220000'
const down = async () => {
  throw new Error('redis down')
}

/** Degradation stays the same (best effort), but every swallowed Redis/RPC failure on the money and tier paths is logged. */
describe('swallowed failures are logged', () => {
  afterEach(() => vi.restoreAllMocks())

  it('spend: the daily cap counter could not be updated', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const deps = fakeDeps()
    deps.store.incrFloatExpireAt = down
    const events = parseSse(await (await makeChatHandler(() => deps)(post('/api/chat', { input: DRAINER }))).text())
    expect(events.map((e) => e.event)).toEqual(['verdict', 'delta', 'delta', 'done'])
    expect(logged).toHaveBeenCalledWith('[emerald] spend', expect.any(Error))
  })

  it('tier: balanceOf failed, the holder falls back to anon', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const deps = fakeDeps({ env: { EMERALD_TOKEN_ADDRESS: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' } })
    expect(await tierForAddress(deps, '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f')).toBe('anon')
    expect(logged).toHaveBeenCalledWith('[emerald] tier', expect.anything())
  })

  it('cache: source cache and verdict cache unavailable', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken: Store = Object.assign(new MemoryStore(), { getJson: down, setJson: down, incrExpireAt: down })
    const s = cachedSources(stubSources({ sourcify: { getContract: async () => null } }), broken)
    expect(await s.sourcify.getContract('0x28C6c06298d514Db089934071355E5743bf21d60')).toBeNull()
    const deps = fakeDeps()
    deps.store.getJson = down
    deps.store.setJson = down
    await runVerdict(deps, DRAINER)
    expect(logged).toHaveBeenCalledWith('[emerald] cache', expect.any(Error))
    expect(logged.mock.calls.filter((c) => c[0] === '[emerald] cache').length).toBeGreaterThanOrEqual(4)
  })
})
