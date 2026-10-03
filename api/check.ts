import { liveDeps } from '../server/deps.js'
import { makeCheckHandler } from '../server/handlers/check.js'

export default { fetch: makeCheckHandler(liveDeps) }
