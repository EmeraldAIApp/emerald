import { describe, expect, it, vi } from 'vitest'
import { resolveAccess, tierForAddress } from '../access.js'
import { newSession } from '../session.js'
import { fakeDeps, get, SECRET } from './helpers.js'

describe('tier resolution', () => {
  const TOKEN = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
  const USER = '0x72Fc85Bab23E46c2434A91e7B5250c959e667e6f'
  const word = (n: bigint) => `0x${n.toString(16).padStart(64, '0')}` as const

  it('reads decimals() and balanceOf($EMERALD), caches the tier', async () => {
    let calls = 0
    const deps = fakeDeps({
      env: { EMERALD_TOKEN_ADDRESS: TOKEN },
      sources: { rpc: { call: async (_to, data) => { calls++; return data === '0x313ce567' ? word(18n) : word(150_000n * 10n ** 18n) } } },
    })
    expect(await tierForAddress(deps, USER)).toBe('holder')
    expect(await tierForAddress(deps, USER)).toBe('holder')
    expect(calls).toBe(2) // decimals + balanceOf, then cache
  })

  it('no token configured or RPC down -> anon', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined) // the RPC failure is logged
    expect(await tierForAddress(fakeDeps(), USER)).toBe('anon')
    expect(await tierForAddress(fakeDeps({ env: { EMERALD_TOKEN_ADDRESS: TOKEN } }), USER)).toBe('anon')
    expect(logged).toHaveBeenCalledWith('[emerald] tier', expect.anything())
    logged.mockRestore()
  })

  it('resolveAccess: no session -> anon by IP; valid session of a holder -> keyed by address', async () => {
    const anon = await resolveAccess(get('/api/quota'), fakeDeps())
    expect(anon).toEqual({ tier: 'anon', id: '9.9.9.9', address: null })
    const deps = fakeDeps({
      env: { EMERALD_TOKEN_ADDRESS: TOKEN },
      sources: { rpc: { call: async (_to, data) => (data === '0x313ce567' ? word(18n) : word(2_000_000n * 10n ** 18n)) } },
    })
    const cookie = `em_session=${newSession(USER, SECRET, Date.parse('2026-09-30T19:00:00Z'))}`
    expect(await resolveAccess(get('/api/quota', { cookie }), deps)).toEqual({ tier: 'whale', id: USER.toLowerCase(), address: USER })
  })
})
