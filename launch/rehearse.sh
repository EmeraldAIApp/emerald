#!/usr/bin/env bash
# Dress rehearsal on an anvil fork of mainnet. From a throwaway key it sends the same createLaunchAndBuy call that
# Stockereum's launch page sends for the "2%" preset (feePpm 20000, feesToHolders false, dev buy in the same tx),
# signed with the REAL Stockereum price signature, then runs the verification that runs after the real launch.
# Fork only: nothing is sent to mainnet. The real launch is done by hand in Stockereum's UI.
# Usage (from the repo root): bash launch/rehearse.sh
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${RPC_URL:-https://ethereum-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8546}"
LOCAL="http://127.0.0.1:$PORT"
FACTORY=0xc6B080DEd03C3382476A76345e79f82BD480977B
WETH=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
LAUNCH='createLaunchAndBuy((string,string,string,address,uint256,uint256,bytes,uint24,bool),uint256)'
DEV_BUY_WEI=50000000000000000 # 0.05 ETH

anvil --fork-url "$RPC" --port "$PORT" --quiet &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  cast chain-id --rpc-url "$LOCAL" >/dev/null 2>&1 && break
  sleep 1
done
[ "$(cast chain-id --rpc-url "$LOCAL")" = "1" ] || { echo "anvil fork did not start"; exit 1; }

WALLET="$(cast wallet new --json)"
ADDR="$(node -e 'console.log(JSON.parse(process.argv[1])[0].address)' "$WALLET")"
KEY="$(node -e 'console.log(JSON.parse(process.argv[1])[0].private_key)' "$WALLET")"
cast rpc anvil_setBalance "$ADDR" 0xDE0B6B3A7640000 --rpc-url "$LOCAL" >/dev/null # 1 ETH, fork only

eval "$(RPC_URL="$LOCAL" bash "$ROOT/launch/price.sh")"
FEE="$(cast call "$FACTORY" "creationFee()(uint256)" --rpc-url "$LOCAL" | cut -d' ' -f1)"
PARAMS="(Emerald,EMERALD,fork rehearsal,$WETH,$PRICE_USD,$PRICE_DEADLINE,$PRICE_SIG,20000,false)"
RECEIPT="$(cast send "$FACTORY" "$LAUNCH" "$PARAMS" 0 --value "$((FEE + DEV_BUY_WEI))" --private-key "$KEY" --rpc-url "$LOCAL" --json)"
# The token is the contract that mints from address(0) in the launch tx (ERC-20 Transfer with topic1 = 0).
TOKEN="$(node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const r = JSON.parse(s)
  if (r.status !== "0x1") {
    console.error(`launch tx reverted: ${r.transactionHash}`)
    process.exit(1)
  }
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
  const mint = r.logs.find((l) => l.topics.length === 3 && l.topics[0] === TRANSFER && BigInt(l.topics[1]) === 0n)
  if (!mint) {
    console.error(`no ERC-20 mint in the launch tx ${r.transactionHash}`)
    process.exit(1)
  }
  console.error(`launch tx gas used: ${BigInt(r.gasUsed)}`)
  console.log(mint.address)
})' <<<"$RECEIPT")"
echo "rehearsal token: $TOKEN  creator: $ADDR"

cd "$ROOT"
npx tsx scripts/verify-launch.ts --rpc "$LOCAL" --token "$TOKEN" --creator "$ADDR"
