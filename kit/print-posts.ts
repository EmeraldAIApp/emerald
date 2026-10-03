// Prints the X posts of one phase, ready to paste, with their X length. Fails if a variable is missing or a post
// does not fit. Usage:
//   npx tsx kit/print-posts.ts --phase pre --site https://… --repo https://github.com/…
//   npx tsx kit/print-posts.ts --phase launch --site https://… --ca 0x…
//   npx tsx kit/print-posts.ts --phase post --site https://… --ca 0x… --claim-eth 0.0123 --claim-tx https://etherscan.io/tx/0x…
import { parseArgs } from 'node:util'
import { POSTS, PROFILE, renderPost, type Phase, type Vars } from './posts.js'
import { X_MAX, xLength } from './xlen.js'

const { values } = parseArgs({
  options: {
    phase: { type: 'string' },
    site: { type: 'string' },
    repo: { type: 'string' },
    ca: { type: 'string' },
    'claim-eth': { type: 'string' },
    'claim-tx': { type: 'string' },
  },
})
const phases: Phase[] = ['pre', 'launch', 'post']
const phase = values.phase as Phase
if (!phases.includes(phase)) {
  console.error(`--phase must be one of: ${phases.join(', ')}`)
  process.exit(2)
}
const vars: Vars = {
  SITE: values.site,
  REPO: values.repo,
  CA: values.ca,
  CLAIM_ETH: values['claim-eth'],
  CLAIM_TX_URL: values['claim-tx'],
}
if (phase === 'pre') {
  console.log(`# profile\nname: ${PROFILE.name}\nlocation: ${PROFILE.location}\nbio (${PROFILE.bio.length}/160): ${PROFILE.bio}\n`)
}
for (const p of POSTS.filter((x) => x.phase === phase)) {
  const text = renderPost(p, vars)
  const n = xLength(text)
  if (n > X_MAX) throw new Error(`${p.id}: ${n} > ${X_MAX}`)
  console.log(`# ${p.id} · media: ${p.media ? `kit/out/${p.media}` : 'none'} · ${n}/${X_MAX}\n${text}\n`)
}
