import { liveDeps } from '../server/deps.js'
import { makeComputeHandler } from '../server/handlers/compute.js'

export default { fetch: makeComputeHandler(liveDeps) }
