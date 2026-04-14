#!/bin/bash
export PATH=/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

pkill -f solana-test-validator 2>/dev/null || true
sleep 1

# Start validator
solana-test-validator --reset --quiet --ledger /tmp/test-ledger &>/tmp/validator.log &
VPID=$!
echo "Validator PID: $VPID"

# Wait for RPC
for i in $(seq 1 30); do
  if solana cluster-version --url http://127.0.0.1:8899 &>/dev/null; then
    echo "Ready after ${i}s"
    break
  fi
  sleep 1
done

# Deploy the already-compiled .so (no recompile needed)
solana program deploy \
  /mnt/c/recycle/target/deploy/smelt_staking.so \
  --url http://127.0.0.1:8899 \
  --program-id /mnt/c/recycle/target/deploy/smelt_staking-keypair.json
echo "Deploy done"

# Run tests (skip build since we just want test output)
cd /mnt/c/recycle
anchor test --skip-local-validator --provider.cluster localnet 2>&1

echo "=== ALL DONE ==="
kill $VPID 2>/dev/null || true
