#!/bin/bash
# Run from WSL: bash /mnt/c/recycle/run-tests.sh
# All output goes to /mnt/c/recycle/test-results.txt

OUTFILE="/mnt/c/recycle/test-results.txt"
exec > "$OUTFILE" 2>&1

export PATH="/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/bin:/usr/local/bin:/bin"

echo "=== $(date) ==="
echo "PATH: $PATH"
echo ""

echo "=== Starting solana-test-validator ==="
solana-test-validator --reset &
VALIDATOR_PID=$!
echo "Validator PID: $VALIDATOR_PID"

echo "Waiting 12s for validator to be ready..."
sleep 12

echo ""
echo "=== Checking validator health ==="
solana --url http://localhost:8899 cluster-version

echo ""
echo "=== Deploying program ==="
cd /mnt/c/recycle
anchor deploy --provider.cluster localnet

echo ""
echo "=== Uploading IDL ==="
anchor idl init --filepath /mnt/c/recycle/target/idl/smelt_staking.json \
  CiMhekpwAzLAfRr8um6Hexpnf8L8iTXkGZxJKin9e9Mk \
  --provider.cluster localnet

echo ""
echo "=== Running anchor tests ==="
anchor test --skip-local-validator

echo ""
echo "=== DONE ==="
kill $VALIDATOR_PID 2>/dev/null
