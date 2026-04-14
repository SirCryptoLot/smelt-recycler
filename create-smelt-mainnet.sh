#!/bin/bash
set -e
export PATH=/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

MAINNET_RPC="https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15"
BURNER=/tmp/burner.json
MINT_KEYPAIR=/tmp/SME88JJYc8NrRvLVwWUgqk3kLuhuUwqu2JKDFeHdXb8.json

echo "=== Burner: $(solana address --keypair $BURNER) ==="
echo "=== Mint keypair: $(solana address --keypair $MINT_KEYPAIR) ==="
echo "=== Balance: $(solana balance --keypair $BURNER --url $MAINNET_RPC) ==="
echo ""

echo "=== Creating SMELT mint with vanity address ==="
spl-token create-token \
  --url $MAINNET_RPC \
  --fee-payer $BURNER \
  --mint-authority $(solana address --keypair $BURNER) \
  --decimals 9 \
  $MINT_KEYPAIR \
  2>&1

SMELT_MINT=$(solana address --keypair $MINT_KEYPAIR)
echo ""
echo "=== Done! ==="
echo "SMELT Mint: $SMELT_MINT"
echo ""
echo "=== Remaining balance ==="
solana balance --keypair $BURNER --url $MAINNET_RPC
