#!/bin/bash
set -e
export PATH=/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

MAINNET_RPC="https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15"
BURNER=/tmp/burner.json
PROJECT=/mnt/c/recycle

echo "=== Burner address ==="
solana address --keypair $BURNER

echo "=== Balance ==="
solana balance --keypair $BURNER --url $MAINNET_RPC

echo ""
echo "=== 1. Deploy staking program to mainnet ==="
cd $PROJECT
anchor deploy \
  --provider.cluster $MAINNET_RPC \
  --provider.wallet $BURNER \
  2>&1

PROGRAM_ID=$(solana address --keypair $PROJECT/target/deploy/smelt_staking-keypair.json)
echo "Program ID: $PROGRAM_ID"

echo ""
echo "=== 2. Create SMELT mint on mainnet ==="
SMELT_MINT=$(spl-token create-token \
  --url $MAINNET_RPC \
  --fee-payer $BURNER \
  --mint-authority $BURNER \
  --decimals 9 \
  2>&1 | grep "Address:" | awk '{print $2}')
echo "SMELT Mint: $SMELT_MINT"

echo ""
echo "=== 3. Upload IDL ==="
anchor idl init \
  --filepath $PROJECT/target/idl/smelt_staking.json \
  --provider.cluster $MAINNET_RPC \
  --provider.wallet $BURNER \
  $PROGRAM_ID 2>&1 || echo "IDL upload skipped (may already exist)"

echo ""
echo "=== Saving results ==="
echo "PROGRAM_ID=$PROGRAM_ID"
echo "SMELT_MINT=$SMELT_MINT"
echo ""
echo "Update lib/constants.ts with these values!"

echo ""
echo "=== Final balance ==="
solana balance --keypair $BURNER --url $MAINNET_RPC
