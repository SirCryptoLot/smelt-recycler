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
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { TrashAccount, MAINNET_RPC } from './solana';
import { SMELT_MINT } from './constants';

const VAULT = new PublicKey('DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z');
const EMPTY_BATCH_SIZE = 7;  // empty accounts: 1 instruction each, fits easily
const DUST_BATCH_SIZE = 2;   // dust accounts: 3 instructions + many account keys per token, tx size limit
const FEE_LAMPORTS_PER_ACCOUNT = Math.ceil(0.002 * 0.05 * LAMPORTS_PER_SOL);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;
const NET_LAMPORTS_PER_ACCOUNT = Math.round(0.002 * 0.95 * LAMPORTS_PER_SOL); // 1_900_000

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simulate a transaction without requiring signatures.
// Returns an error string if simulation fails, null if it passes.
async function preSimulate(tx: Transaction): Promise<string | null> {
  try {
    // Must serialize the full transaction (with zeroed signature slots), not just the message.
    // simulateTransaction rejects raw message bytes.
    const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
    const res = await fetch(MAINNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'simulateTransaction',
        params: [txBase64, { encoding: 'base64', sigVerify: false, commitment: 'confirmed' }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as {
      error?: { message?: string };
      result?: { value?: { err?: unknown; logs?: string[] } };
    };
    // RPC-level error (e.g. transaction too large)
    if (json.error) return json.error.message ?? 'RPC error';
    const val = json.result?.value;
    if (!val?.err) return null;
    const logs = val.logs ?? [];
    const detail = logs.length > 0
      ? logs.join('\n')
      : JSON.stringify(val.err);
    return detail;
  } catch {
    return null; // non-blocking — let wallet try
  }
}

async function buildBatchTransaction(
  batch: TrashAccount[],
  owner: PublicKey,
  blockhash: string,
  connection: Connection,
  donationPct: number,
): Promise<Transaction> {
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;

  // Pass 1: close empty accounts first so SOL is credited before ATA creation fees
  for (const account of batch) {
    if (account.rawAmount === 0n) {
      tx.add(createCloseAccountInstruction(account.pubkey, owner, owner, [], account.tokenProgram));
    }
  }

  // Pass 2: transfer + close non-empty accounts (ATA creation paid from credits above)
  for (const account of batch) {
    if (account.rawAmount !== 0n) {
      const tokenProg = account.tokenProgram;

      // Re-fetch the live balance to ensure we transfer the exact current amount.
      // The cached rawAmount may be stale if tokens arrived after the scan.
      let liveAmount = account.rawAmount;
      let liveDecimals = account.decimals;
      try {
        const liveInfo = await connection.getTokenAccountBalance(account.pubkey, 'confirmed');
        const parsed = BigInt(liveInfo.value.amount);
        if (parsed > 0n) liveAmount = parsed;
        liveDecimals = liveInfo.value.decimals;
      } catch {
        // Fall back to cached amount if RPC fails
      }

      const vaultATA = await getAssociatedTokenAddress(account.mint, VAULT, true, tokenProg);

      // Guard: if source === destination the connected wallet IS the vault.
      // Self-transfers are no-ops so the account can never be drained.
      if (vaultATA.equals(account.pubkey)) {
        throw new Error(
          'Cannot recycle vault accounts — disconnect the vault wallet and reconnect with your personal wallet.'
        );
      }

      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(owner, vaultATA, VAULT, account.mint, tokenProg),
        createTransferCheckedInstruction(
          account.pubkey, account.mint, vaultATA, owner, liveAmount, liveDecimals, [], tokenProg
        ),
        createCloseAccountInstruction(account.pubkey, owner, owner, [], tokenProg),
      );
    }
  }

  // Platform fee (5%)
  tx.add(
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: VAULT,
      lamports: FEE_LAMPORTS_PER_ACCOUNT * batch.length,
    }),
  );

  // Optional donation
  if (donationPct > 0) {
    const donationLamports = Math.floor(NET_LAMPORTS_PER_ACCOUNT * batch.length * donationPct / 100);
    if (donationLamports > 0) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: VAULT,
          lamports: donationLamports,
        }),
      );
    }
  }

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
  donationPct = 0,
): Promise<{ succeeded: number; failed: number; solReclaimed: number; solDonated: number }> {
  const empty = accounts.filter((a) => a.rawAmount === 0n);
  const dust  = accounts.filter((a) => a.rawAmount !== 0n);
  const batches = [
    ...chunk(empty, EMPTY_BATCH_SIZE),
    ...chunk(dust, DUST_BATCH_SIZE),
  ].filter((b) => b.length > 0);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const transactions = await Promise.all(
    batches.map((batch) => buildBatchTransaction(batch, owner, blockhash, connection, donationPct))
  );

  // Append SMELT ATA creation to the first transaction ONLY if it doesn't exist yet.
  // Placed at the end so it's funded by SOL reclaimed from the closes above it.
  const ownerSmeltATA = await getAssociatedTokenAddress(
    SMELT_MINT, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const smeltATAInfo = await connection.getAccountInfo(ownerSmeltATA);
  if (!smeltATAInfo) {
    transactions[0].add(
      createAssociatedTokenAccountIdempotentInstruction(
        owner, ownerSmeltATA, owner, SMELT_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
      )
    );
  }

  for (let i = 0; i < transactions.length; i++) {
    const failDetail = await preSimulate(transactions[i]);
    if (failDetail !== null) {
      throw new Error(`Batch ${i + 1} simulation failed — ${failDetail}`);
    }
  }

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

  const grossReclaim = succeeded * 0.002 * 0.95;
  const solDonated = grossReclaim * donationPct / 100;
  return { succeeded, failed, solReclaimed: grossReclaim - solDonated, solDonated };
}
