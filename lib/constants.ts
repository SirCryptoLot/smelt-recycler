import { PublicKey } from '@solana/web3.js';

// Mainnet SMELT mint — vanity address SME...
export const SMELT_MINT = new PublicKey('SME88JJYc8NrRvLVwWUgqk3kLuhuUwqu2JKDFeHdXb8');
// Staking program — not yet deployed to mainnet (needs ~2 SOL)
export const STAKING_PROGRAM_ID = new PublicKey('CiMhekpwAzLAfRr8um6Hexpnf8L8iTXkGZxJKin9e9Mk');

// Updated to match data/keypairs/vault.json pubkey
export const VAULT_PUBKEY = new PublicKey('DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z');

// Staking pool — SMELT ATA owned by vault keypair. Created by scripts/setup-staking-ata.ts.
// Address is deterministic: getAssociatedTokenAddress(SMELT_MINT, VAULT_PUBKEY)
// Run the setup script once to create it on-chain, then replace the placeholder below.
export const STAKING_POOL_ATA = new PublicKey('11111111111111111111111111111111'); // placeholder — replaced after setup script runs
export const COOLDOWN_DAYS = 7;

export const LIQUIDATION_THRESHOLD_USD = 1;
export const TRASH_THRESHOLD_USD = 0.10;
export const PLATFORM_FEE_BPS = 500; // 5%
export const STAKING_BOOST = 1.5;

// Emission schedule — set PROGRAM_START_TIMESTAMP to Date.now() at launch
export const PROGRAM_START_TIMESTAMP: number = 1744416000000; // 2026-04-12 UTC launch
export const EPOCH_DURATION_MS = 6 * 30 * 24 * 60 * 60 * 1000;
export const INITIAL_SMELT_PER_ACCOUNT = 1_000;

export function currentSmeltPerAccount(): number {
  if (PROGRAM_START_TIMESTAMP === 0) return INITIAL_SMELT_PER_ACCOUNT;
  const epoch = Math.floor((Date.now() - PROGRAM_START_TIMESTAMP) / EPOCH_DURATION_MS);
  return Math.floor(INITIAL_SMELT_PER_ACCOUNT / Math.pow(2, epoch));
}
