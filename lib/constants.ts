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
export const STAKING_POOL_ATA = new PublicKey('9TTxxr5tYAdq6HDWMUNRz1xgppBNmrAVzKyarEfhPdok');
export const COOLDOWN_DAYS = 7;

export const LIQUIDATION_THRESHOLD_USD = 10;
export const TRASH_THRESHOLD_USD = 0.10;
export const PLATFORM_FEE_BPS = 500; // 5%

// Distribution epoch (48 hours) — controls how often SOL is distributed to stakers
export const DISTRIBUTION_EPOCH_MS = 48 * 60 * 60 * 1000;
export const SMELT_PER_ACCOUNT = 62;

export function currentSmeltPerAccount(): number {
  return SMELT_PER_ACCOUNT;
}
