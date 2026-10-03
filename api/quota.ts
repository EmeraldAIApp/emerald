import { liveDeps } from '../server/deps.js'
import { makeQuotaHandler } from '../server/handlers/quota.js'

export default { fetch: makeQuotaHandler(liveDeps) }
