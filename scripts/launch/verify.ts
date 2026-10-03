import {
  encodeAbiParameters,
  isAddressEqual,
  keccak256,
  parseAbi,
  zeroAddress,
  type Hex,
  type PublicClient,
} from 'viem'

// Stockereum on Ethereum mainnet (sources verified on Sourcify, exact_match).
export const FACTORY = '0xc6B080DEd03C3382476A76345e79f82BD480977B' as const
export const FEE_ESCROW = '0xAcefe251da006887dA41C063D06CC82A060824BA' as const
export const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const
// The launch page's "2%" preset: Stockereum keeps platformFeeFor(20000) = 10000 ppm (1 %), the creator the other 1 %.
export const FEE_PPM = 20_000
export const PLATFORM_PPM = 10_000n
export const SYMBOL = 'EMERALD'

const factoryAbi = parseAbi(['function hook() view returns (address)'])
const hookAbi = parseAbi([
  'struct Launch { address token; address feeRecipient; address quote; uint40 openedAt; uint24 feePpm; bool quoteIsCurrency0; bool pendingDevBuy; bool feesToHolders; address devBuyer; int24 tickLower; int24 tickUpper; uint128 liquidity; }',
  'function getLaunch(bytes32 poolId) view returns (Launch)',
  'function escrow() view returns (address)',
  'function platformFeeFor(uint24 feePpm) pure returns (uint256)',
])
const tokenAbi = parseAbi([
  'function symbol() view returns (string)',
  'function creator() view returns (address)',
  'function distributor() view returns (address)',
  'function factory() view returns (address)',
])
const escrowAbi = parseAbi(['function claimable(address account, address currency) view returns (uint256)'])

/** PoolId = keccak256(abi.encode(PoolKey{WETH/token sorted, fee 0, tickSpacing 200, hooks})). */
export function poolIdFor(token: Hex, hook: Hex): Hex {
  const [c0, c1] = BigInt(WETH) < BigInt(token) ? [WETH, token] : [token, WETH]
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
      [c0, c1, 0, 200, hook],
    ),
  )
}

export interface LaunchReads {
  token: Hex
  creator: Hex
  tokenSymbol: string
  tokenCreator: Hex
  tokenDistributor: Hex
  tokenFactory: Hex
  hookEscrow: Hex
  platformFeePpm: bigint
  launch: { token: Hex; feeRecipient: Hex; feePpm: number; feesToHolders: boolean }
  claimableWei: bigint
}

export interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

export function checkLaunch(r: LaunchReads): CheckResult[] {
  const eq = (a: Hex, b: Hex) => isAddressEqual(a, b)
  return [
    { name: 'token was created by the Stockereum factory', ok: eq(r.tokenFactory, FACTORY), detail: r.tokenFactory },
    { name: 'symbol is EMERALD', ok: r.tokenSymbol === SYMBOL, detail: r.tokenSymbol },
    { name: 'the hook has a pool for this token', ok: eq(r.launch.token, r.token), detail: r.launch.token },
    { name: 'feePpm is 20000 (2 %)', ok: r.launch.feePpm === FEE_PPM, detail: String(r.launch.feePpm) },
    { name: 'feesToHolders is OFF', ok: !r.launch.feesToHolders, detail: String(r.launch.feesToHolders) },
    { name: 'fee recipient is the creator wallet', ok: eq(r.launch.feeRecipient, r.creator), detail: r.launch.feeRecipient },
    { name: 'token creator is the creator wallet', ok: eq(r.tokenCreator, r.creator), detail: r.tokenCreator },
    { name: 'token has no holder distributor', ok: eq(r.tokenDistributor, zeroAddress), detail: r.tokenDistributor },
    { name: 'hook escrow is the FeeEscrow', ok: eq(r.hookEscrow, FEE_ESCROW), detail: r.hookEscrow },
    { name: 'platform takes 1 % (creator keeps 1 %)', ok: r.platformFeePpm === PLATFORM_PPM, detail: `${r.platformFeePpm} ppm` },
    { name: 'creator claimable WETH > 0', ok: r.claimableWei > 0n, detail: `${r.claimableWei} wei` },
  ]
}

export async function readLaunch(client: PublicClient, token: Hex, creator: Hex): Promise<LaunchReads> {
  const hook = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'hook' })
  const [tokenSymbol, tokenCreator, tokenDistributor, tokenFactory, hookEscrow, platformFeePpm, launch, claimableWei] =
    await Promise.all([
      client.readContract({ address: token, abi: tokenAbi, functionName: 'symbol' }),
      client.readContract({ address: token, abi: tokenAbi, functionName: 'creator' }),
      client.readContract({ address: token, abi: tokenAbi, functionName: 'distributor' }),
      client.readContract({ address: token, abi: tokenAbi, functionName: 'factory' }),
      client.readContract({ address: hook, abi: hookAbi, functionName: 'escrow' }),
      client.readContract({ address: hook, abi: hookAbi, functionName: 'platformFeeFor', args: [FEE_PPM] }),
      client.readContract({ address: hook, abi: hookAbi, functionName: 'getLaunch', args: [poolIdFor(token, hook)] }),
      client.readContract({ address: FEE_ESCROW, abi: escrowAbi, functionName: 'claimable', args: [creator, WETH] }),
    ])
  return {
    token,
    creator,
    tokenSymbol,
    tokenCreator,
    tokenDistributor,
    tokenFactory,
    hookEscrow,
    platformFeePpm,
    launch: {
      token: launch.token,
      feeRecipient: launch.feeRecipient,
      feePpm: launch.feePpm,
      feesToHolders: launch.feesToHolders,
    },
    claimableWei,
  }
}

export interface SiteReads {
  compute: { feesClaimableWei: string; feesClaimedWei: string }
  selfCheck: { level?: string; headline?: string }
  caInBundle: boolean // the CA is baked into the page's JS (VITE_EMERALD_TOKEN_ADDRESS)
}

export function checkSite(s: SiteReads): CheckResult[] {
  const fees = BigInt(s.compute.feesClaimableWei) + BigInt(s.compute.feesClaimedWei)
  return [
    { name: 'site /api/compute shows fees (claimable + claimed > 0)', ok: fees > 0n, detail: `${fees} wei` },
    {
      name: 'site answers the CA with green "This is me."',
      ok: s.selfCheck.level === 'green' && s.selfCheck.headline === 'This is me.',
      detail: `${s.selfCheck.level} · ${s.selfCheck.headline}`,
    },
    { name: 'site page shows the CA (not "CA: soon")', ok: s.caInBundle, detail: s.caInBundle ? 'found in the JS bundle' : 'not found' },
  ]
}

export async function readSite(site: string, token: Hex, fetchImpl: typeof fetch = fetch): Promise<SiteReads> {
  const base = site.replace(/\/+$/, '')
  const computeRes = await fetchImpl(`${base}/api/compute`)
  if (!computeRes.ok) throw new Error(`GET /api/compute -> HTTP ${computeRes.status}`)
  const compute = (await computeRes.json()) as SiteReads['compute']
  const checkRes = await fetchImpl(`${base}/api/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: token }),
  })
  if (!checkRes.ok) throw new Error(`POST /api/check -> HTTP ${checkRes.status}`)
  const selfCheck = (await checkRes.json()) as SiteReads['selfCheck']
  const html = await (await fetchImpl(`${base}/`)).text()
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1]!, `${base}/`).href)
  let caInBundle = html.toLowerCase().includes(token.toLowerCase())
  for (const src of scripts) {
    if (caInBundle) break
    caInBundle = (await (await fetchImpl(src)).text()).toLowerCase().includes(token.toLowerCase())
  }
  return { compute, selfCheck, caInBundle }
}
