// scripts/mint-smelt.ts
import * as fs from 'fs';
import * as path from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { SMELT_MINT, currentSmeltPerAccount } from '../lib/constants';
import { MAINNET_RPC } from '../lib/solana';

const ADMIN_KEYPAIR_PATH = path.join(process.cwd(), 'data/keypairs/admin.json');

function loadAdminKeypair(): Keypair {
  const raw = JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

/**
 * Mint SMELT to `recipient` for `accountsClosed` recycled accounts.
 * Returns the transaction signature.
 */
export async function mintSmeltReward(
  recipient: PublicKey,
  accountsClosed: number,
): Promise<string> {
  const connection = new Connection(MAINNET_RPC, 'confirmed');
  const adminKeypair = loadAdminKeypair();

  const smeltPerAccount = currentSmeltPerAccount();
  const totalSmelt = smeltPerAccount * accountsClosed;
  const rawAmount = BigInt(totalSmelt) * BigInt(10 ** 9);

  const recipientATA = await getAssociatedTokenAddress(
    SMELT_MINT,
    recipient,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const tx = new Transaction();

  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      adminKeypair.publicKey,
      recipientATA,
      recipient,
      SMELT_MINT,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )
  );

  tx.add(
    createMintToInstruction(
      SMELT_MINT,
      recipientATA,
      adminKeypair.publicKey,
      rawAmount,
      [],
      TOKEN_PROGRAM_ID,
    )
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [adminKeypair], {
    commitment: 'confirmed',
  });

  return sig;
}
