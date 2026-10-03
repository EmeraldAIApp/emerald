import { liveDeps } from '../server/deps.js'
import { makeChatHandler } from '../server/handlers/chat.js'

export default { fetch: makeChatHandler(liveDeps) }
