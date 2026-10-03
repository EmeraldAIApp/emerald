// Runs the real cases in engine/test/fixtures/cases/ against mainnet LIVE (no recordings).
// Skips without network. Exits 1 if any case misses the expected level/codes or any source fails.
// Usage: npx tsx scripts/smoke-live.ts [case-name]
import { readdirSync } from 'node:fs'
import { runChecks } from '../engine/index.js'
import { liveSources } from '../engine/sources/index.js'
import { CASES_DIR, CASES_NOW, loadCase } from '../engine/test/helpers/recording.js'
import { hasNetwork, politeFetch } from './lib/polite-fetch.js'

const RPC = process.env.RPC_URL || 'https://ethereum-rpc.publicnode.com'
if (!(await hasNetwork(RPC))) {
  console.log('SKIP: no network')
  process.exit(0)
}
const only = process.argv[2]
const names = readdirSync(CASES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .filter((n) => !only || n === only)
const sources = liveSources({ rpcUrl: RPC, fetchImpl: politeFetch(fetch, { log: (m) => console.log(`  ${m}`) }) })
let bad = 0
for (const name of names) {
  const c = loadCase(name)
  const t0 = Date.now()
  // ctx.now = the cases' verification date: contract age does not drift over time; the tags do.
  const v = await runChecks(c.input, { sources, userAddress: c.userAddress, now: CASES_NOW })
  const codes = v.reasons.map((r) => r.code)
  const missing = c.expectedReasonCodes.filter((x) => !codes.includes(x))
  const ok = v.level === c.expectedLevel && missing.length === 0 && v.checksFailed.length === 0
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${v.level}/${c.expectedLevel} ${Date.now() - t0}ms failed=[${v.checksFailed}] missing=[${missing}]`)
}
console.log(`${names.length - bad}/${names.length} live cases pass`)
process.exit(bad ? 1 : 0)
