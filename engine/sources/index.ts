import type { Sources } from '../types.js'
import {
  blockscoutGetAddress,
  blockscoutGetMetadata,
  blockscoutGetToken,
  blockscoutGetTokenTransfers,
  blockscoutGetTransaction,
  blockscoutGetTransactions,
} from './blockscout.js'
import { goplusAddressSecurity, goplusTokenSecurity } from './goplus.js'
import type { FetchLike } from './http.js'
import { openchainLookupFunctions } from './openchain.js'
import { DEFAULT_RPC, rpcCall, rpcGetCode, rpcGetTransactionByHash, rpcSimulate } from './rpc.js'
import { sourcifyGetContract, sourcifyResolvedAbi } from './sourcify.js'

export { SourceError, type FetchLike } from './http.js'

export function liveSources({ rpcUrl = DEFAULT_RPC, fetchImpl }: { rpcUrl?: string; fetchImpl?: FetchLike } = {}): Sources {
  const o = fetchImpl ? { fetchImpl } : {}
  const r = { url: rpcUrl, ...o }
  return {
    rpc: {
      simulate: (call, opts) => rpcSimulate(call, { ...r, ...opts }),
      getCode: (a) => rpcGetCode(a, r),
      getTransactionByHash: (h) => rpcGetTransactionByHash(h, r),
      call: (to, data) => rpcCall(to, data, r),
    },
    blockscout: {
      getAddress: (a) => blockscoutGetAddress(a, o),
      getTokenTransfers: (a, opts) => blockscoutGetTokenTransfers(a, { ...o, ...opts }),
      getTransactions: (a, opts) => blockscoutGetTransactions(a, { ...o, ...opts }),
      getToken: (a) => blockscoutGetToken(a, o),
      getTransaction: (h) => blockscoutGetTransaction(h, o),
      getMetadata: (as) => blockscoutGetMetadata(as, o),
    },
    goplus: {
      addressSecurity: (a) => goplusAddressSecurity(a, o),
      tokenSecurity: (a) => goplusTokenSecurity(a, o),
    },
    sourcify: {
      getContract: (a) => sourcifyGetContract(a, o),
      resolvedAbi: (a) => sourcifyResolvedAbi(a, o),
    },
    openchain: { lookupFunctions: (s) => openchainLookupFunctions(s, o) },
  }
}
