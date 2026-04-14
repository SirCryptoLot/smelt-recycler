#!/bin/bash
export PATH=/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

MNEMONIC="fuel pulse increase empty cruise when add gauge night minimum uphold course clump artwork awesome gentle mushroom hybrid embrace desk oval all filter replace"

echo "$MNEMONIC" | solana-keygen recover \
  --outfile /tmp/burner.json \
  --force \
  --no-bip39-passphrase \
  2>&1

echo "=== Address ==="
solana address --keypair /tmp/burner.json

echo "=== Mainnet Balance ==="
solana balance --keypair /tmp/burner.json --url https://api.mainnet-beta.solana.com
