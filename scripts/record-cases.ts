// Records the real responses the engine requests for each case in engine/test/fixtures/cases/.
// Usage: npx tsx scripts/record-cases.ts          (all)
//        npx tsx scripts/record-cases.ts <name>   (one)
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { runChecks } from '../engine/index.js'
import { liveSources } from '../engine/sources/index.js'
import { CASES_DIR, CASES_NOW, loadCase, RECORDINGS_DIR, recordingFetch, type Recording } from '../engine/test/helpers/recording.js'
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
mkdirSync(RECORDINGS_DIR, { recursive: true })
const fetchImpl = politeFetch(fetch, { log: (m) => console.log(`  ${m}`) })
let mismatches = 0
for (const name of names) {
  const c = loadCase(name)
  const rec: Recording = { case: name, recordedAt: new Date().toISOString(), entries: {} }
  const sources = liveSources({ rpcUrl: RPC, fetchImpl: recordingFetch(fetchImpl, rec) })
  const v = await runChecks(c.input, { sources, userAddress: c.userAddress, now: CASES_NOW })
  writeFileSync(`${RECORDINGS_DIR}${name}.json`, JSON.stringify(rec, null, 1) + '\n')
  const codes = v.reasons.map((r) => r.code)
  const missing = c.expectedReasonCodes.filter((x) => !codes.includes(x))
  const ok = v.level === c.expectedLevel && missing.length === 0 && v.checksFailed.length === 0
  if (!ok) mismatches++
  console.log(`${ok ? 'OK  ' : 'DIFF'} ${name}: ${v.level} (expected ${c.expectedLevel}) failed=[${v.checksFailed}] missing=[${missing}] codes=[${codes}]`)
}
console.log(`${names.length - mismatches}/${names.length} cases match`)
process.exit(mismatches ? 1 : 0)
