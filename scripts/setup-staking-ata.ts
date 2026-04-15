// scripts/setup-staking-ata.ts
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { SMELT_MINT, VAULT_PUBKEY } from '../lib/constants';
import { MAINNET_RPC } from '../lib/solana';

async function main() {
  const raw = JSON.parse(process.env.VAULT_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('VAULT_KEYPAIR env var not set');
  const vaultKeypair = Keypair.fromSecretKey(Uint8Array.from(raw));

  const connection = new Connection(MAINNET_RPC, 'confirmed');

  const stakingATA = await getAssociatedTokenAddress(
    SMELT_MINT,
    VAULT_PUBKEY,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  console.log('Staking pool ATA address:', stakingATA.toBase58());

  const existing = await connection.getAccountInfo(stakingATA);
  if (existing) {
    console.log('ATA already exists. Add this to lib/constants.ts:');
    console.log(`export const STAKING_POOL_ATA = new PublicKey('${stakingATA.toBase58()}');`);
    return;
  }

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      vaultKeypair.publicKey,
      stakingATA,
      VAULT_PUBKEY,
      SMELT_MINT,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [vaultKeypair], { commitment: 'confirmed' });
  console.log('ATA created. Tx:', sig);
  console.log('\nAdd this to lib/constants.ts:');
  console.log(`export const STAKING_POOL_ATA = new PublicKey('${stakingATA.toBase58()}');`);
}

main().catch(console.error);
