// Raw shapes of the 5 sources, exactly as they answered live on 2026-09-30
// (see engine/test/fixtures/raw/_manifest.json). Strings stay strings:
// the engine converts them to Hex/bigint later.

// ---------- Sourcify v2: GET https://sourcify.dev/server/v2/contract/1/{address}?fields=abi,proxyResolution
export interface SourcifyAbiParam {
  name: string
  type: string
  internalType?: string
  indexed?: boolean
  components?: SourcifyAbiParam[]
}
export interface SourcifyAbiItem {
  type: string // 'function' | 'event' | 'error' | 'constructor' | 'fallback' | 'receive'
  name?: string
  inputs?: SourcifyAbiParam[]
  outputs?: SourcifyAbiParam[]
  stateMutability?: string
  anonymous?: boolean
  payable?: boolean
  constant?: boolean
}
export interface SourcifyProxyResolution {
  isProxy: boolean
  proxyType: string | null
  implementations: { address: string; name?: string }[]
}
/** 200 = verified. 404 = not verified (EOA or unverified contract). */
export interface SourcifyContract {
  match: string | null
  creationMatch: string | null
  runtimeMatch: string | null
  chainId: string // "1" as a STRING
  address: string
  matchId?: string
  verifiedAt?: string
  abi?: SourcifyAbiItem[]
  proxyResolution?: SourcifyProxyResolution
}

// ---------- openchain: GET https://api.openchain.xyz/signature-database/v1/lookup?function=0x..&filter=true
export interface OpenchainSig {
  name: string
  filtered: boolean
  hasVerifiedContract: boolean
}
export interface OpenchainLookup {
  ok: boolean
  error?: string
  result?: { function: Record<string, OpenchainSig[] | null>; event: Record<string, OpenchainSig[] | null> }
}

// ---------- Blockscout v2 (https://eth.blockscout.com/api/v2)
export interface BlockscoutTag {
  slug: string
  name: string
  tagType: string
  ordinal: number
  meta: unknown
}
export interface BlockscoutAddressParam {
  hash: string
  ens_domain_name: string | null
  implementations: { address_hash: string; name: string | null }[]
  is_contract: boolean
  is_scam: boolean
  is_verified: boolean
  metadata: { tags: BlockscoutTag[] } | null
  name: string | null
  private_tags: unknown[]
  proxy_type: string | null
  public_tags: unknown[]
  reputation: string
  watchlist_names: unknown[]
}
export interface BlockscoutToken {
  address_hash: string
  circulating_market_cap: string | null
  circulating_supply: string | null
  decimals: string | null
  exchange_rate: string | null
  holders_count: string
  icon_url: string | null
  name: string | null
  reputation: string
  symbol: string | null
  total_supply: string | null
  type: string
  volume_24h: string | null
}
/** GET /addresses/{a}. Unknown address -> 200 with coin_balance null (NOT 404). Invalid hash -> 422. */
export interface BlockscoutAddress {
  block_number_balance_updated_at: number | null
  coin_balance: string | null
  creation_status: string | null
  creation_transaction_hash: string | null
  creator_address_hash: string | null
  ens_domain_name: string | null
  exchange_rate: string | null
  has_beacon_chain_withdrawals: boolean
  has_logs: boolean
  has_token_transfers: boolean
  has_tokens: boolean
  has_validated_blocks: boolean
  hash: string
  implementations: { address_hash: string; name: string | null }[]
  is_contract: boolean
  is_scam: boolean
  is_verified: boolean
  metadata: { tags: BlockscoutTag[] } | null
  name: string | null
  private_tags: unknown[]
  proxy_type: string | null
  public_tags: unknown[]
  reputation: string
  token: BlockscoutToken | null
  watchlist_address_id: number | null
  watchlist_names: unknown[]
}
export interface BlockscoutTokenTransfer {
  block_hash: string
  block_number: number
  from: BlockscoutAddressParam
  to: BlockscoutAddressParam
  log_index: number
  method: string | null
  timestamp: string | null
  token: BlockscoutToken
  token_type: string
  total: { decimals: string | null; value?: string; token_id?: string | null }
  transaction_hash: string
  type: string
}
export interface BlockscoutPage<T> {
  items: T[]
  next_page_params: Record<string, string | number> | null
}
export interface BlockscoutTransaction {
  hash: string
  status: string | null
  result: string
  timestamp: string | null
  block_number: number | null
  nonce: number
  from: BlockscoutAddressParam
  to: BlockscoutAddressParam | null
  created_contract: BlockscoutAddressParam | null
  value: string
  method: string | null
  raw_input: string
  decoded_input: {
    method_call: string
    method_id: string
    parameters: { name: string; type: string; value: unknown }[]
  } | null
  token_transfers: BlockscoutTokenTransfer[] | null
  token_transfers_overflow: boolean | null
  authorization_list: unknown[]
  transaction_types: string[]
  fee: { type: string; value: string }
}
/** GET https://metadata.services.blockscout.com/api/v1/metadata?addresses=a,b&chainId=1 (CHECKSUMMED keys) */
export interface BlockscoutMetadata {
  addresses: Record<string, { tags: { slug: string; name: string; tagType: string; ordinal: number; meta: string }[] }>
}

// ---------- GoPlus (https://api.gopluslabs.io/api/v1), no key. HTTP 200 even when rate limited -> look at code.
export interface GoPlusEnvelope<T> {
  code: number // 1 ok, 2 partial, 4029 rate limit
  message: string
  result?: T
}
export interface GoPlusAddressSecurity {
  cybercrime: string
  money_laundering: string
  number_of_malicious_contracts_created: string
  gas_abuse: string
  financial_crime: string
  darkweb_transactions: string
  reinit: string
  phishing_activities: string
  contract_address: string
  fake_kyc: string
  blacklist_doubt: string
  fake_standard_interface: string
  data_source: string
  stealing_attack: string
  blackmail_activities: string
  sanctioned: string
  malicious_mining_activities: string
  mixer: string
  fake_token: string
  honeypot_related_address: string
}
/** result keyed by LOWERCASE address; {} if it is not a token; almost every field can be missing. */
export interface GoPlusTokenSecurity {
  token_name?: string
  token_symbol?: string
  holder_count?: string
  is_open_source?: string
  is_proxy?: string
  is_mintable?: string
  is_honeypot?: string
  honeypot_with_same_creator?: string
  cannot_buy?: string
  cannot_sell_all?: string
  buy_tax?: string
  sell_tax?: string
  trust_list?: string
  owner_change_balance?: string
  fake_token?: { true_token_address: string; value: number }
}

// ---------- JSON-RPC (https://ethereum-rpc.publicnode.com)
export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}
export interface JsonRpcResponse<T> {
  jsonrpc: string
  id: number | string
  result?: T
  error?: JsonRpcError
}
export interface RpcLog {
  address: string // lowercase; 0xeeee…eeee = native ETH (traceTransfers)
  topics: string[]
  data: string
  blockHash: string
  blockNumber: string
  blockTimestamp?: string
  transactionHash: string
  transactionIndex: string
  logIndex: string
  removed: boolean
}
export interface SimCallResult {
  returnData: string
  logs: RpcLog[]
  gasUsed: string
  maxUsedGas?: string
  status: string // '0x1' | '0x0'
  error?: { code: number; message: string; data?: string }
}
export interface SimBlockResult {
  number: string
  timestamp: string
  hash: string
  gasUsed: string
  calls: SimCallResult[]
}
export interface RpcTransaction {
  type: string
  chainId?: string
  nonce: string
  gas: string
  gasPrice?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  to: string | null
  value: string
  input: string
  hash: string
  blockHash: string | null
  blockNumber: string | null
  transactionIndex: string | null
  from: string
  blockTimestamp?: string
}
