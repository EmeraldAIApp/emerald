#!/usr/bin/env bash
# Prints `export` lines with Stockereum's signed ETH price (the signature is valid ~10 minutes).
# Usage: eval "$(bash launch/price.sh)"      (RPC_URL defaults to publicnode; it only reads priceSigner)
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
FACTORY=0xc6B080DEd03C3382476A76345e79f82BD480977B
WETH=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
RPC="${RPC_URL:-https://ethereum-rpc.publicnode.com}"
SIGNER="$(cast call "$FACTORY" "priceSigner()(address)" --rpc-url "$RPC")"
curl -fsS -A "Mozilla/5.0" "https://stockereum.com/api/price?quote=$WETH&symbol=WETH" | SIGNER="$SIGNER" node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const j = JSON.parse(s)
  if (String(j.signer).toLowerCase() !== process.env.SIGNER.toLowerCase()) {
    console.error(`price signer ${j.signer} != factory.priceSigner() ${process.env.SIGNER}`)
    process.exit(1)
  }
  if (!/^\d+$/.test(j.usdPrice) || !/^\d+$/.test(j.deadline) || !/^0x[0-9a-fA-F]{130}$/.test(j.signature)) {
    console.error("unexpected /api/price response: " + s.slice(0, 300))
    process.exit(1)
  }
  console.log(`export PRICE_USD=${j.usdPrice}`)
  console.log(`export PRICE_DEADLINE=${j.deadline}`)
  console.log(`export PRICE_SIG=${j.signature}`)
})'
