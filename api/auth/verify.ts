import { liveDeps } from '../../server/deps.js'
import { makeVerifyHandler } from '../../server/handlers/auth.js'
import { mainnetClient } from '../../server/siwe.js'

export default { fetch: makeVerifyHandler(liveDeps, () => mainnetClient(liveDeps().env.RPC_URL)) }
