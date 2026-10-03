import { SourceError, type SourceId } from '../../sources/http.js'
import type { BlockscoutSource, GoPlusSource, OpenchainSource, RpcSource, Sources, SourcifySource } from '../../types.js'

export interface SourceStubs {
  rpc?: Partial<RpcSource>
  blockscout?: Partial<BlockscoutSource>
  goplus?: Partial<GoPlusSource>
  sourcify?: Partial<SourcifySource>
  openchain?: Partial<OpenchainSource>
}

const missing = (source: SourceId, method: string) => () =>
  Promise.reject(new SourceError(source, 'network', `not stubbed: ${source}.${method}`))

/** Fake Sources: anything not stubbed fails like a source that is down. */
export function stubSources(s: SourceStubs = {}): Sources {
  return {
    rpc: {
      simulate: s.rpc?.simulate ?? missing('rpc', 'simulate'),
      getCode: s.rpc?.getCode ?? missing('rpc', 'getCode'),
      getTransactionByHash: s.rpc?.getTransactionByHash ?? missing('rpc', 'getTransactionByHash'),
      call: s.rpc?.call ?? missing('rpc', 'call'),
    },
    blockscout: {
      getAddress: s.blockscout?.getAddress ?? missing('blockscout', 'getAddress'),
      getTokenTransfers: s.blockscout?.getTokenTransfers ?? missing('blockscout', 'getTokenTransfers'),
      getTransactions: s.blockscout?.getTransactions ?? missing('blockscout', 'getTransactions'),
      getToken: s.blockscout?.getToken ?? missing('blockscout', 'getToken'),
      getTransaction: s.blockscout?.getTransaction ?? missing('blockscout', 'getTransaction'),
      getMetadata: s.blockscout?.getMetadata ?? missing('blockscout', 'getMetadata'),
    },
    goplus: {
      addressSecurity: s.goplus?.addressSecurity ?? missing('goplus', 'addressSecurity'),
      tokenSecurity: s.goplus?.tokenSecurity ?? missing('goplus', 'tokenSecurity'),
    },
    sourcify: {
      getContract: s.sourcify?.getContract ?? missing('sourcify', 'getContract'),
      resolvedAbi: s.sourcify?.resolvedAbi ?? missing('sourcify', 'resolvedAbi'),
    },
    openchain: {
      lookupFunctions: s.openchain?.lookupFunctions ?? missing('openchain', 'lookupFunctions'),
    },
  }
}
