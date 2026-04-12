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
import { TrashAccount, MAINNET_RPC } from './solana';

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

// Simulate a transaction without requiring signatures.
// Returns the last relevant log line if simulation fails, null if it passes (or if pre-sim itself errors).
async function preSimulate(tx: Transaction): Promise<string | null> {
  try {
    const messageBase64 = Buffer.from(tx.serializeMessage()).toString('base64');
    const res = await fetch(MAINNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'simulateTransaction',
        params: [messageBase64, { encoding: 'base64', sigVerify: false, commitment: 'confirmed' }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as {
      result?: { value?: { err?: unknown; logs?: string[] } };
    };
    const val = json.result?.value;
    if (!val?.err) return null;
    const logs = val.logs ?? [];
    // Find the most informative log line — prefer Program log: / Error lines from the end
    const detail =
      [...logs].reverse().find((l) => l.includes('Error') || l.startsWith('Program log:')) ??
      logs.at(-1) ??
      JSON.stringify(val.err);
    return detail;
  } catch {
    return null; // pre-sim failure is non-blocking — let wallet try
  }
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
    if (account.rawAmount === 0n) {
      // Empty account — close directly, no transfer needed
      tx.add(createCloseAccountInstruction(account.pubkey, owner, owner));
    } else {
      const vaultATA = await getAssociatedTokenAddress(account.mint, VAULT, true);
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(owner, vaultATA, VAULT, account.mint),
        createTransferCheckedInstruction(
          account.pubkey, account.mint, vaultATA, owner, account.rawAmount, account.decimals
        ),
        createCloseAccountInstruction(account.pubkey, owner, owner),
      );
    }
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
  return false;
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

  // Pre-simulate before presenting to wallet so we can surface real error details.
  for (let i = 0; i < transactions.length; i++) {
    const failDetail = await preSimulate(transactions[i]);
    if (failDetail !== null) {
      throw new Error(`Batch ${i + 1} simulation failed — ${failDetail}`);
    }
  }

  // Single wallet popup for all transactions
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
