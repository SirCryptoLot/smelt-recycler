#!/bin/bash
set -e
export PATH=/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Kill any leftover validator
pkill -f solana-test-validator 2>/dev/null || true; sleep 1

# Start fresh
solana-test-validator --reset --quiet --ledger /tmp/test-ledger &>/tmp/validator.log &
VPID=$!
echo "Validator PID: $VPID"

# Wait until RPC is up (up to 35s)
for i in $(seq 1 35); do
  if solana cluster-version --url http://127.0.0.1:8899 &>/dev/null; then
    echo "Validator ready after ${i}s"
    break
  fi
  sleep 1
done

cd /mnt/c/recycle

echo '=== anchor deploy ==='
anchor deploy --provider.cluster localnet

echo '=== IDL init ==='
anchor idl init --filepath target/idl/smelt_staking.json CiMhekpwAzLAfRr8um6Hexpnf8L8iTXkGZxJKin9e9Mk --provider.cluster localnet || echo 'IDL init skipped (already exists or no IDL changes)'

echo '=== anchor test ==='
anchor test --skip-local-validator --provider.cluster localnet

echo '=== ALL DONE ==='
kill $VPID 2>/dev/null || true
