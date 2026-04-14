// scripts/mint-smelt.ts
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

function loadAdminKeypair(): Keypair {
  const raw = JSON.parse(process.env.ADMIN_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('ADMIN_KEYPAIR env var not set');
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
