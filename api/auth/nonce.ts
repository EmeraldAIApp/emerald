import { liveDeps } from '../../server/deps.js'
import { makeNonceHandler } from '../../server/handlers/auth.js'

export default { fetch: makeNonceHandler(liveDeps) }
