#!/bin/bash
export PATH=/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899
export ANCHOR_WALLET=/mnt/c/recycle/data/keypairs/admin.json

# Start validator if not running
if ! solana cluster-version --url http://127.0.0.1:8899 &>/dev/null; then
  echo "Starting validator..."
  pkill -f solana-test-validator 2>/dev/null || true
  sleep 1
  solana-test-validator --reset --quiet --ledger /tmp/test-ledger &>/tmp/validator.log &
  VPID=$!
  for i in $(seq 1 30); do
    solana cluster-version --url http://127.0.0.1:8899 &>/dev/null && echo "Ready after ${i}s" && break
    sleep 1
  done
  solana program deploy \
    /mnt/c/recycle/target/deploy/smelt_staking.so \
    --url http://127.0.0.1:8899 \
    --program-id /mnt/c/recycle/target/deploy/smelt_staking-keypair.json
  echo "Deployed"
else
  echo "Validator already running"
fi

echo "=== Running anchor tests ==="
cd /mnt/c/recycle
NODE_PATH=/tmp/anchor-test-runner/node_modules \
  /tmp/anchor-test-runner/node_modules/.bin/ts-mocha \
  -p ./tsconfig.anchor.json \
  -t 1000000 \
  tests/**/*.ts

EXIT=$?
echo "=== Tests done (exit $EXIT) ==="
exit $EXIT
