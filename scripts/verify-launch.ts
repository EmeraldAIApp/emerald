// Verifies a $EMERALD launch on-chain (and optionally the live site). Read-only: never signs or sends anything.
// Usage: npx tsx scripts/verify-launch.ts --token 0x… --creator 0x… [--quote zc|weth|0x…] [--rpc URL] [--site https://…]
// --quote: the pool's quote token. $EMERALD launched against $ZC, so that is the default; weth for a WETH pair.
import { parseArgs } from 'node:util'
import { createPublicClient, getAddress, http, isAddress } from 'viem'
import { mainnet } from 'viem/chains'
import { checkLaunch, checkSite, readLaunch, readSite, WETH, ZC, type CheckResult } from './launch/verify.js'

const { values } = parseArgs({
  options: {
    token: { type: 'string' },
    creator: { type: 'string' },
    rpc: { type: 'string' },
    site: { type: 'string' },
    quote: { type: 'string' },
  },
})
if (!values.token || !isAddress(values.token) || !values.creator || !isAddress(values.creator)) {
  console.error('usage: npx tsx scripts/verify-launch.ts --token 0x… --creator 0x… [--quote zc|weth|0x…] [--rpc URL] [--site https://…]')
  process.exit(2)
}
const token = getAddress(values.token)
const creator = getAddress(values.creator)
const q = (values.quote ?? 'zc').toLowerCase()
const quote = q === 'zc' ? ZC : q === 'weth' ? WETH : isAddress(q) ? getAddress(q) : null
if (!quote) {
  console.error(`--quote must be zc, weth or an address: ${values.quote}`)
  process.exit(2)
}
const rpc = values.rpc ?? process.env.RPC_URL ?? 'https://ethereum-rpc.publicnode.com'
const client = createPublicClient({ chain: mainnet, transport: http(rpc, { timeout: 15_000, retryCount: 2 }) })

const results: CheckResult[] = checkLaunch(await readLaunch(client, token, creator, quote))
if (values.site) results.push(...checkSite(await readSite(values.site, token)))
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`)
const failed = results.filter((r) => !r.ok).length
console.log(failed === 0 ? `ALL ${results.length} CHECKS PASS` : `${failed} CHECK(S) FAILED: do not announce`)
process.exitCode = failed === 0 ? 0 : 1 // no process.exit(): on Windows it can abort Node while sockets close
