import type {
  BlockscoutAddress,
  BlockscoutToken,
  BlockscoutTokenTransfer,
  BlockscoutTransaction,
  GoPlusAddressSecurity,
  GoPlusTokenSecurity,
  OpenchainSig,
  RpcTransaction,
  SimCallResult,
  SourcifyAbiItem,
  SourcifyContract,
} from './sources/raw-types.js'

// ===================== Shared contract (do NOT change without the orchestrator) =====================
export type Hex = `0x${string}`
export type Level = 'green' | 'yellow' | 'red'
export type CheckName = 'decode' | 'simulate' | 'poisoning' | 'labels' | 'token'
export type Severity = 'ok' | 'warn' | 'danger'
export type ParsedInput =
  | { kind: 'tx'; tx: { from?: Hex; to: Hex; data: Hex; value: bigint } }
  | {
      kind: 'typedData'
      typedData: {
        domain: Record<string, unknown>
        types: Record<string, { name: string; type: string }[]>
        primaryType: string
        message: Record<string, unknown>
      }
    }
  | { kind: 'address'; address: Hex }
  | { kind: 'txHash'; hash: Hex }
  | { kind: 'unknown'; raw: string }
export interface Reason {
  code: string
  check: CheckName
  severity: Severity
  text: string
  evidenceUrl?: string
}
export interface CheckResult {
  check: CheckName
  status: 'ok' | 'failed' | 'skipped'
  reasons: Reason[]
}
export interface Verdict {
  level: Level
  headline: string
  reasons: Reason[]
  checksOk: CheckName[]
  checksFailed: CheckName[]
  input: ParsedInput
  chainId: 1
  engineVersion: string
}

// ===================== Injectable sources (shapes verified live) =====================
export interface SimCall {
  from: Hex
  to: Hex
  data: Hex
  value: bigint
}
export interface MetadataTag {
  slug: string
  name: string
  tagType: string
}
export interface RpcSource {
  simulate(call: SimCall, opts?: { balanceOverride?: bigint }): Promise<SimCallResult>
  getCode(address: Hex): Promise<string>
  getTransactionByHash(hash: Hex): Promise<RpcTransaction | null>
  call(to: Hex, data: Hex): Promise<Hex>
}
export interface BlockscoutSource {
  getAddress(address: Hex): Promise<BlockscoutAddress>
  getTokenTransfers(address: Hex, opts?: { maxPages?: number }): Promise<{ items: BlockscoutTokenTransfer[]; truncated: boolean }>
  getTransactions(address: Hex, opts?: { maxPages?: number; filter?: 'from' | 'to' }): Promise<{ items: BlockscoutTransaction[]; truncated: boolean }>
  getToken(address: Hex): Promise<BlockscoutToken | null>
  getTransaction(hash: Hex): Promise<BlockscoutTransaction | null>
  /** Result keys are lowercase. An address without tags does not appear. */
  getMetadata(addresses: Hex[]): Promise<Record<string, MetadataTag[]>>
}
export interface GoPlusSource {
  addressSecurity(address: Hex): Promise<GoPlusAddressSecurity>
  /** null = GoPlus does not recognize it as a token (result {}). */
  tokenSecurity(address: Hex): Promise<GoPlusTokenSecurity | null>
}
export interface SourcifySource {
  /** null = not verified (HTTP 404). */
  getContract(address: Hex): Promise<SourcifyContract | null>
  /** ABI to decode calls to `address`; for proxies, the implementation's ABI first. */
  resolvedAbi(address: Hex): Promise<{ abi: SourcifyAbiItem[]; implementation: string | null } | null>
}
export interface OpenchainSource {
  /** Lowercase keys; null = unknown selector. */
  lookupFunctions(selectors: Hex[]): Promise<Record<string, OpenchainSig[] | null>>
}
export interface Sources {
  rpc: RpcSource
  blockscout: BlockscoutSource
  goplus: GoPlusSource
  sourcify: SourcifySource
  openchain: OpenchainSource
}

// ===================== Engine internal types =====================
export type TypedDataInput = Extract<ParsedInput, { kind: 'typedData' }>['typedData']

/** Asset movement. For ERC-721, amount = 1n and tokenId carries the id. Lowercase addresses. */
export type Movement =
  | { kind: 'transfer'; asset: Hex; standard: 'native' | 'erc20' | 'erc721'; from: Hex; to: Hex; amount: bigint; tokenId?: bigint }
  | { kind: 'approval'; asset: Hex; standard: 'erc20' | 'erc721'; owner: Hex; spender: Hex; amount: bigint }
  | { kind: 'approvalForAll'; asset: Hex; owner: Hex; operator: Hex; approved: boolean }

export interface TxLike {
  from: Hex | null
  to: Hex
  data: Hex
  value: bigint
}
export interface ExecutedTx {
  hash: Hex
  status: 'success' | 'reverted'
  movements: Movement[]
}
/** What gets analyzed, already resolved (a txHash becomes tx + executed effects). Lowercase addresses. */
export type Subject =
  | { kind: 'tx'; tx: TxLike; executed: ExecutedTx | null }
  | { kind: 'typedData'; typedData: TypedDataInput }
  | { kind: 'address'; address: Hex }
  | { kind: 'unsupported'; reason: Reason; failed: boolean }

/** What the input does, according to decode. Lowercase addresses. */
export type Action =
  | { type: 'none' }
  | { type: 'nativeTransfer'; to: Hex; value: bigint }
  | { type: 'tokenTransfer'; token: Hex; standard: 'erc20' | 'erc721'; from: Hex | null; to: Hex; amount: bigint }
  | { type: 'approve'; token: Hex; standard: 'erc20' | 'erc721'; spender: Hex; amount: bigint }
  | { type: 'approvalForAll'; token: Hex; operator: Hex; approved: boolean }
  | { type: 'permit'; via: 'eip2612' | 'permit2'; tokens: Hex[]; spender: Hex; maxAmount: bigint; unlimited: boolean }
  | { type: 'seaport'; offerer: Hex | null; offerItems: number; itemsToOfferer: number }
  | { type: 'call'; to: Hex; functionName: string | null; decodedWith: 'sourcify' | 'openchain' | null }
  | { type: 'typedDataUnknown'; primaryType: string }
