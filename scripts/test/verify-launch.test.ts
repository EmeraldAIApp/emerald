import { describe, expect, it } from 'vitest'
import { checkLaunch, checkSite, poolIdFor, readSite, type LaunchReads } from '../launch/verify.js'

const HOOK = '0x322dcEc4958C14e021A9F1cD49DF11b9457968cC'
const CREATOR = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const TOKEN = '0xe285c19Fc43DA5Ae5a993B7e72Bc1C09aAb7D096'

function goodReads(): LaunchReads {
  return {
    token: TOKEN,
    creator: CREATOR,
    tokenSymbol: 'EMERALD',
    tokenCreator: CREATOR,
    tokenDistributor: '0x0000000000000000000000000000000000000000',
    tokenFactory: '0xc6B080DEd03C3382476A76345e79f82BD480977B',
    hookEscrow: '0xAcefe251da006887dA41C063D06CC82A060824BA',
    platformFeePpm: 10_000n,
    launch: { token: TOKEN, feeRecipient: CREATOR, feePpm: 20_000, feesToHolders: false },
    claimableWei: 500_000_000_000_000n,
  }
}
const failed = (r: LaunchReads) => checkLaunch(r).filter((c) => !c.ok).map((c) => c.name)

describe('poolIdFor', () => {
  it('matches the poolId the real factory returned on the mainnet fork', () => {
    // token and poolId logged by launch/test/StockereumLaunch.t.sol (forge asserts keccak256(abi.encode(key)) == poolId)
    expect(poolIdFor(TOKEN, HOOK)).toBe('0x1fbda688caf7d730778a7b0220948e45f5b3e53e958d613699d7439c4440c543')
  })
})

describe('checkLaunch', () => {
  it('passes a correct launch', () => {
    expect(failed(goodReads())).toEqual([])
    expect(checkLaunch(goodReads())).toHaveLength(11)
  })
  it('fails when feesToHolders is ON (irreversible: do not announce)', () => {
    const r = goodReads()
    r.launch.feesToHolders = true
    expect(failed(r)).toEqual(['feesToHolders is OFF'])
  })
  it('fails when the fee is the 1 % or the 3 % preset instead of 2 %', () => {
    for (const feePpm of [10_000, 30_000]) {
      const r = goodReads()
      r.launch.feePpm = feePpm
      expect(failed(r)).toEqual(['feePpm is 20000 (2 %)'])
    }
  })
  it('fails when the fees go to someone else', () => {
    const r = goodReads()
    r.launch.feeRecipient = '0x2222222222222222222222222222222222222222'
    expect(failed(r)).toEqual(['fee recipient is the creator wallet'])
  })
  it('fails when the hook has no pool for the token (wrong CA)', () => {
    const r = goodReads()
    r.launch.token = '0x0000000000000000000000000000000000000000'
    expect(failed(r)).toEqual(['the hook has a pool for this token'])
  })
  it('fails when nothing is claimable yet', () => {
    const r = goodReads()
    r.claimableWei = 0n
    expect(failed(r)).toEqual(['creator claimable WETH > 0'])
  })
  it('fails each of the other six checks on its own mutation', () => {
    const OTHER = '0x2222222222222222222222222222222222222222'
    const mutations: [string, (r: LaunchReads) => void][] = [
      ['token was created by the Stockereum factory', (r) => { r.tokenFactory = OTHER }],
      ['symbol is EMERALD', (r) => { r.tokenSymbol = 'EMERALD2' }],
      ['token creator is the creator wallet', (r) => { r.tokenCreator = OTHER }],
      ['token has no holder distributor', (r) => { r.tokenDistributor = OTHER }],
      ['hook escrow is the FeeEscrow', (r) => { r.hookEscrow = OTHER }],
      ['platform takes 1 % (creator keeps 1 %)', (r) => { r.platformFeePpm = 5_000n }],
    ]
    for (const [name, mutate] of mutations) {
      const r = goodReads()
      mutate(r)
      expect(failed(r), name).toEqual([name])
    }
  })
  it('compares addresses case-insensitively', () => {
    const r = goodReads()
    r.launch.feeRecipient = '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD'
    expect(failed(r)).toEqual([])
  })
})

describe('checkSite', () => {
  it('passes when fees are visible and the CA answers "This is me."', () => {
    const r = checkSite({
      compute: { feesClaimableWei: '500000000000000', feesClaimedWei: '0' },
      selfCheck: { level: 'green', headline: 'This is me.' },
      caInBundle: true,
    })
    expect(r.every((c) => c.ok)).toBe(true)
  })
  it('counts claimed fees too (after the first claim claimable drops to 0)', () => {
    const r = checkSite({
      compute: { feesClaimableWei: '0', feesClaimedWei: '5' },
      selfCheck: { level: 'green', headline: 'This is me.' },
      caInBundle: true,
    })
    expect(r[0]!.ok).toBe(true)
  })
  it('fails when the site still shows no fees or does not recognize the CA', () => {
    const r = checkSite({
      compute: { feesClaimableWei: '0', feesClaimedWei: '0' },
      selfCheck: { level: 'yellow', headline: 'Check before you sign.' },
      caInBundle: false,
    })
    expect(r.map((c) => c.ok)).toEqual([false, false, false])
  })
})

describe('readSite', () => {
  function fakeSite(bundle: string) {
    const calls: { url: string; init?: RequestInit }[] = []
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, init })
      if (u.endsWith('/api/compute'))
        return Response.json({ llmUsd: 0, checksRun: 3, feesClaimableWei: '1', feesClaimedWei: '0', updatedAt: '2026-10-01T00:00:00Z' })
      if (u.endsWith('/api/check')) return Response.json({ level: 'green', headline: 'This is me.' })
      if (u.endsWith('/assets/index-abc.js')) return new Response(bundle)
      return new Response('<!doctype html><script type="module" crossorigin src="/assets/index-abc.js"></script>')
    }) as typeof fetch
    return { calls, fake }
  }
  it('GETs /api/compute, POSTs the CA to /api/check and looks for the CA in the JS bundle', async () => {
    const { calls, fake } = fakeSite(`const CA="${TOKEN.toLowerCase()}"`)
    const s = await readSite('https://emerald.test/', TOKEN, fake)
    expect(calls.map((c) => c.url)).toEqual([
      'https://emerald.test/api/compute',
      'https://emerald.test/api/check',
      'https://emerald.test/',
      'https://emerald.test/assets/index-abc.js',
    ])
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({ input: TOKEN })
    expect(s).toMatchObject({ selfCheck: { headline: 'This is me.' }, caInBundle: true })
  })
  it('reports a bundle still built without the CA', async () => {
    const { fake } = fakeSite('const CA=""')
    expect((await readSite('https://emerald.test', TOKEN, fake)).caInBundle).toBe(false)
  })
})
