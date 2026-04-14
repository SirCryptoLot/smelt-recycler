# Recycle Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the RECYCLE ALL button to execute real Solana transactions that transfer dust tokens to the Vault, close token accounts, and return reclaimed SOL to the user minus a 5% fee.

**Architecture:** Three changes: (1) extend `TrashAccount` with `rawAmount`/`decimals` fields needed for on-chain transfers, (2) create `lib/recycle.ts` with `recycleAccounts()` that builds batched transactions and signs them in a single Phantom popup via `signAllTransactions`, (3) update `app/page.tsx` to call `recycleAccounts` and show `recycling`/`success` UI states.

**Tech Stack:** @solana/web3.js (Transaction, SystemProgram, LAMPORTS_PER_SOL), @solana/spl-token (createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, createCloseAccountInstruction, getAssociatedTokenAddress), @solana/wallet-adapter-react (signAllTransactions from useWallet)

---

### Task 1: Extend TrashAccount with rawAmount and decimals

**Files:**
- Modify: `lib/solana.ts`
- Modify: `lib/__tests__/solana.test.ts`

The SPL token transfer instruction requires the raw integer token amount as a `bigint` and the mint's decimal count. Currently `TrashAccount` only stores the UI float amount. This task adds the two missing fields and updates the test helpers.

- [ ] **Step 1: Extend the TrashAccount interface and ParsedTokenInfo in lib/solana.ts**

Replace lines 9–20 (the two interface blocks) with:

```typescript
export interface TrashAccount {
  pubkey: PublicKey;
  mint: PublicKey;
  balance: number;        // UI amount (decimals applied)
  usdValue: number;       // balance × pricePerToken
  pricePerToken: number;  // 0 if unlisted
  rawAmount: bigint;      // exact token amount for transferChecked
  decimals: number;       // mint decimals for transferChecked
}

interface ParsedTokenInfo {
  mint: string;
  tokenAmount: {
    uiAmount: number | null;
    amount: string;    // raw integer as decimal string e.g. "142000000000"
    decimals: number;
  };
}
```

- [ ] **Step 2: Populate rawAmount and decimals in getTrashAccounts**

In `lib/solana.ts`, replace the `.map()` block (lines 69–81) with:

```typescript
  return nonEmpty
    .map((a) => {
      const info = a.account.data.parsed.info as ParsedTokenInfo;
      const mintStr = info.mint;
      const balance = info.tokenAmount.uiAmount ?? 0;
      const pricePerToken = prices[mintStr] ?? 0;
      return {
        pubkey: a.pubkey,
        mint: new PublicKey(mintStr),
        balance,
        usdValue: balance * pricePerToken,
        pricePerToken,
        rawAmount: BigInt(info.tokenAmount.amount),
        decimals: info.tokenAmount.decimals,
      };
    })
    .filter((a) => a.usdValue < 0.10);
```

- [ ] **Step 3: Update makeAccount helper in solana.test.ts to include amount and decimals**

In `lib/__tests__/solana.test.ts`, replace the `makeAccount` function (lines 11–16):

```typescript
function makeAccount(pubkey: PublicKey, mint: string, uiAmount: number, amount = '0', decimals = 6) {
  return {
    pubkey,
    account: { data: { parsed: { info: { mint, tokenAmount: { uiAmount, amount, decimals } } } } },
  };
}
```

- [ ] **Step 4: Fix the "throws when Jupiter returns non-ok" test to match graceful behavior**

The implementation returns `{}` (empty prices, pricePerToken 0) on non-ok responses — it does not throw. Update the test at lines 98–107 in `lib/__tests__/solana.test.ts`:

```typescript
  it('treats Jupiter non-ok responses as unlisted (pricePerToken 0)', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 100, '100000000', 6)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429 });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result[0].pricePerToken).toBe(0);
    expect(result[0].usdValue).toBe(0);
  });
```

- [ ] **Step 5: Update remaining makeAccount calls to pass amount and decimals**

In `lib/__tests__/solana.test.ts`, update the two tests that check returned `TrashAccount` fields:

Around line 137 ("includes accounts with usdValue < $0.10"):
```typescript
      value: [makeAccount(ACCT_BONK, MINT_BONK, 142000, '142000000000', 6)],
```

Around line 155 ("returns only trash accounts from a mixed wallet"):
```typescript
        makeAccount(ACCT_BONK, MINT_BONK, 142000, '142000000000', 6), // $0.0284 → trash
        makeAccount(ACCT_USDC, MINT_USDC, 12.4, '12400000', 6),       // $12.40  → kept
```

- [ ] **Step 6: Run the lib tests**

```bash
npx jest --config jest.config.js
```

Expected: all 9 tests in `lib/__tests__/solana.test.ts` pass.

- [ ] **Step 7: Commit**

```bash
git add lib/solana.ts lib/__tests__/solana.test.ts
git commit -m "feat: extend TrashAccount with rawAmount and decimals for on-chain transfers"
```

---

### Task 2: Create lib/recycle.ts with recycleAccounts

**Files:**
- Create: `lib/__tests__/recycle.test.ts`
- Create: `lib/recycle.ts`

Core transaction logic. `recycleAccounts` splits accounts into batches of 5, builds one transaction per batch (instructions: create Vault ATA idempotently, transferChecked tokens, closeAccount, pay fee), signs all at once via a single `signAllTransactions` popup, sends in parallel, and retries failed batches up to 3×.

Constants:
- `VAULT = new PublicKey('DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z')`
- Batch size: 5 accounts per transaction
- Fee per account: `Math.ceil(0.002 * 0.05 * LAMPORTS_PER_SOL)` lamports → Vault
- Retry: 3 attempts, 1500ms delay between attempts

- [ ] **Step 1: Write the failing test file lib/__tests__/recycle.test.ts**

```typescript
// lib/__tests__/recycle.test.ts
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TrashAccount } from '../solana';

// Mock @solana/spl-token instruction builders — they return minimal objects
jest.mock('@solana/spl-token', () => ({
  createAssociatedTokenAccountIdempotentInstruction: jest.fn(() => ({ type: 'createATA' })),
  createTransferCheckedInstruction: jest.fn(() => ({ type: 'transfer' })),
  createCloseAccountInstruction: jest.fn(() => ({ type: 'close' })),
  getAssociatedTokenAddress: jest.fn(async () =>
    new PublicKey('11111111111111111111111111111112')
  ),
}));

// Mock Transaction so serialize() doesn't fail on unsigned test transactions
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  class MockTransaction {
    instructions: any[] = [];
    recentBlockhash?: string;
    feePayer?: any;
    add(...ixs: any[]) { this.instructions.push(...ixs); return this; }
    serialize() { return Buffer.from('fake-tx'); }
  }
  return { ...actual, Transaction: MockTransaction };
});

// Mock connection from lib/solana
const mockConnection = {
  getLatestBlockhash: jest.fn(),
  sendRawTransaction: jest.fn(),
  confirmTransaction: jest.fn(),
};
jest.mock('../solana', () => ({
  connection: mockConnection,
}));

import { recycleAccounts } from '../recycle';

const OWNER = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');
const MINT_A = new PublicKey('DezXAZ8z7PnrnRJjz3wXboRgixCa6xjnB7YaB1pPB263');

function makeTrashAccount(i: number): TrashAccount {
  const bytes = new Uint8Array(32);
  bytes[0] = i + 1; // avoid all-zeros key
  return {
    pubkey: new PublicKey(bytes),
    mint: MINT_A,
    balance: 100,
    usdValue: 0.01,
    pricePerToken: 0.0001,
    rawAmount: BigInt(100_000_000),
    decimals: 6,
  };
}

describe('recycleAccounts', () => {
  let signAllTransactions: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection.getLatestBlockhash.mockResolvedValue({
      blockhash: 'testblockhash',
      lastValidBlockHeight: 1000,
    });
    mockConnection.sendRawTransaction.mockResolvedValue('sig-ok');
    mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
    signAllTransactions = jest.fn(async (txs: any[]) => txs);
  });

  it('happy path: 5 accounts → signAllTransactions called once, returns correct solReclaimed', async () => {
    const accounts = Array.from({ length: 5 }, (_, i) => makeTrashAccount(i));
    const result = await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    expect(signAllTransactions).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.solReclaimed).toBeCloseTo(5 * 0.002 * 0.95, 6);
  });

  it('builds one transaction per 5-account batch (10 accounts → 2 txs)', async () => {
    const accounts = Array.from({ length: 10 }, (_, i) => makeTrashAccount(i));
    await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    const [calledTxs] = signAllTransactions.mock.calls[0] as [any[]];
    expect(calledTxs).toHaveLength(2);
  });

  it('partial failure: batch 2 fails all retries → succeeded=5, failed=5', async () => {
    const accounts = Array.from({ length: 10 }, (_, i) => makeTrashAccount(i));
    let sendCount = 0;
    mockConnection.sendRawTransaction.mockImplementation(async () => {
      sendCount++;
      // First 3 calls (batch 1 + up to 2 retries never needed) succeed,
      // calls 4+ (batch 2 and its retries) fail
      if (sendCount > 3) throw new Error('network error');
      return 'sig-ok';
    });

    const result = await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);
    expect(result.succeeded).toBe(5);
    expect(result.failed).toBe(5);
    expect(result.solReclaimed).toBeCloseTo(5 * 0.002 * 0.95, 6);
  });

  it('user rejection: signAllTransactions throws → recycleAccounts re-throws', async () => {
    const accounts = [makeTrashAccount(0)];
    signAllTransactions.mockRejectedValue(new Error('User rejected'));

    await expect(
      recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any)
    ).rejects.toThrow('User rejected');
  });

  it('fee instruction: lamports = ceil(batchSize * 0.002 * 0.05 * LAMPORTS_PER_SOL)', async () => {
    const { SystemProgram } = jest.requireActual('@solana/web3.js');
    const transferSpy = jest.spyOn(SystemProgram, 'transfer');

    const accounts = Array.from({ length: 5 }, (_, i) => makeTrashAccount(i));
    await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    expect(transferSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lamports: Math.ceil(5 * 0.002 * 0.05 * LAMPORTS_PER_SOL),
      })
    );
    transferSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx jest --config jest.config.js lib/__tests__/recycle.test.ts
```

Expected: FAIL — `Cannot find module '../recycle'`

- [ ] **Step 3: Create lib/recycle.ts**

```typescript
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
      await connection.confirmTransaction(sig, 'confirmed');
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
```

- [ ] **Step 4: Run recycle tests to confirm they pass**

```bash
npx jest --config jest.config.js lib/__tests__/recycle.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Run all lib tests**

```bash
npx jest --config jest.config.js
```

Expected: all tests in `lib/__tests__/` pass.

- [ ] **Step 6: Commit**

```bash
git add lib/recycle.ts lib/__tests__/recycle.test.ts
git commit -m "feat: add recycleAccounts - batched SPL token close with single Phantom popup"
```

---

### Task 3: Wire up page.tsx — recycling and success UI states

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/__tests__/page.test.tsx`

Replace the `alert()` stub with a real `recycleAccounts` call. Add `'recycling'` and `'success'` to the Status type. Add two new UI panels and update the RECYCLE ALL button.

- [ ] **Step 1: Read the existing app/__tests__/page.test.tsx**

Read `app/__tests__/page.test.tsx` in full to understand the existing mock structure before making changes.

- [ ] **Step 2: Replace app/page.tsx with the full updated version**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getTrashAccounts, solToReclaim, TrashAccount, connection } from '@/lib/solana';
import { recycleAccounts } from '@/lib/recycle';

type Status = 'disconnected' | 'scanning' | 'results' | 'empty' | 'error' | 'recycling' | 'success';

export default function Home() {
  const { publicKey, connected, disconnect, signAllTransactions } = useWallet();
  const [status, setStatus] = useState<Status>('disconnected');
  const [accounts, setAccounts] = useState<TrashAccount[]>([]);
  const [error, setError] = useState('');
  const [recycleResult, setRecycleResult] = useState<{
    succeeded: number;
    failed: number;
    solReclaimed: number;
  } | null>(null);

  const scan = useCallback(async () => {
    setStatus('scanning');
    setError('');
    try {
      if (!publicKey) return;
      const result = await getTrashAccounts(publicKey);
      if (result.length === 0) {
        setStatus('empty');
      } else {
        setAccounts(result);
        setStatus('results');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }, [publicKey]);

  const recycle = useCallback(async () => {
    if (!publicKey || !signAllTransactions) return;
    setStatus('recycling');
    try {
      const result = await recycleAccounts(accounts, publicKey, signAllTransactions, connection);
      setRecycleResult(result);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction cancelled');
      setStatus('results');
    }
  }, [accounts, publicKey, signAllTransactions]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setStatus('disconnected');
      setAccounts([]);
      return;
    }
    scan();
  }, [connected, publicKey, scan]);

  const sol = solToReclaim(accounts.length);

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'linear-gradient(135deg,#042f2e,#064e3b)' }}
    >
      {/* Sidebar */}
      <aside className="w-44 flex-shrink-0 border-r border-emerald-900/40 bg-black/20 flex flex-col p-4 gap-4">
        <div>
          <div className="text-emerald-300 font-extrabold text-lg">♻ Recycler</div>
          <div className="text-emerald-400/50 text-xs">Reclaim your SOL</div>
        </div>

        {connected && publicKey && (
          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/40 p-3">
            <div className="text-emerald-400 text-xs mb-1">WALLET</div>
            <div className="text-emerald-50 text-xs font-mono truncate">
              {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
            </div>
          </div>
        )}

        {status === 'results' && (
          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/40 p-3">
            <div className="text-emerald-400 text-xs mb-1">SOL TO RECLAIM</div>
            <div className="text-emerald-50 text-2xl font-bold">{sol.toFixed(3)}</div>
            <div className="text-emerald-400/50 text-xs">{accounts.length} accounts</div>
          </div>
        )}

        <div className="mt-auto">
          {!connected ? (
            <WalletMultiButton className="!w-full !bg-emerald-500 !text-white !font-bold !text-sm !rounded-lg" />
          ) : (
            <button
              onClick={() => disconnect()}
              className="w-full border border-emerald-700/40 text-emerald-400 text-sm rounded-lg py-2 hover:bg-emerald-900/30 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col p-6">
        {status === 'disconnected' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl">🔌</div>
            <div className="text-emerald-300 font-semibold">Connect your wallet</div>
            <div className="text-emerald-400/50 text-sm text-center">
              Connect Phantom to scan for dust accounts
            </div>
          </div>
        )}

        {status === 'scanning' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
            <div className="text-emerald-300 font-semibold">Scanning accounts…</div>
            <div className="text-emerald-400/50 text-sm">Fetching prices from Jupiter</div>
          </div>
        )}

        {status === 'results' && (
          <div className="flex flex-col h-full">
            <div className="text-emerald-400 text-xs font-semibold tracking-widest mb-3">
              TRASH ACCOUNTS
            </div>
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
              {accounts.map((account) => (
                <div
                  key={account.pubkey.toBase58()}
                  className="flex items-center justify-between rounded-lg border border-red-500/25 bg-red-950/20 px-4 py-3"
                >
                  <div>
                    <div className="text-emerald-50 text-sm font-semibold">
                      {account.mint.toBase58().slice(0, 4)}…{account.mint.toBase58().slice(-4)}
                    </div>
                    <div className="text-emerald-400/50 text-xs">
                      {account.balance.toLocaleString()} tokens
                    </div>
                  </div>
                  <div className="text-red-300 text-base font-bold">
                    ${account.usdValue.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4">
              <button
                onClick={recycle}
                disabled={!signAllTransactions}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
              >
                ♻ RECYCLE ALL · +{sol.toFixed(3)} SOL
              </button>
            </div>
          </div>
        )}

        {status === 'recycling' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
            <div className="text-emerald-300 font-semibold">
              Recycling {accounts.length} accounts…
            </div>
            <div className="text-emerald-400/50 text-sm">
              Approve in Phantom, then wait for confirmation
            </div>
          </div>
        )}

        {status === 'success' && recycleResult && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="text-4xl">✅</div>
            <div className="text-emerald-300 font-bold text-xl">
              Reclaimed ~{recycleResult.solReclaimed.toFixed(3)} SOL
            </div>
            <div className="text-emerald-400/60 text-sm">
              {recycleResult.succeeded} accounts recycled
              {recycleResult.failed > 0 && (
                <span className="text-amber-400 ml-2">
                  · {recycleResult.failed} failed
                </span>
              )}
            </div>
            <button
              onClick={scan}
              className="border border-emerald-700/40 text-emerald-400 text-sm rounded-lg px-4 py-2 hover:bg-emerald-900/30 transition-colors"
            >
              Scan Again
            </button>
          </div>
        )}

        {status === 'empty' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl">✅</div>
            <div className="text-emerald-300 font-semibold">Nothing to recycle</div>
            <div className="text-emerald-400/50 text-sm">Your wallet is clean.</div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-4 max-w-md text-center">
              <div className="text-red-300 font-semibold mb-1">Scan failed</div>
              <div className="text-red-300/70 text-sm">{error}</div>
            </div>
            <button
              onClick={scan}
              className="border border-emerald-700/40 text-emerald-400 text-sm rounded-lg px-4 py-2 hover:bg-emerald-900/30 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Update app/__tests__/page.test.tsx**

After reading the file (Step 1), make these changes:

**Add to the jest.mock block at the top** (alongside the existing `@/lib/solana` mock):
```typescript
jest.mock('@/lib/recycle', () => ({
  recycleAccounts: jest.fn(),
}));
```

**Update the `useWallet` mock** to include `signAllTransactions`:
```typescript
// Inside the useWallet mock return value, add:
signAllTransactions: jest.fn(async (txs: any[]) => txs),
```

**Add two new tests** after the existing results-state test:

```typescript
  it('shows recycling spinner when RECYCLE ALL is clicked', async () => {
    const { recycleAccounts: mockRecycle } = require('@/lib/recycle');
    mockRecycle.mockImplementation(() => new Promise(() => {})); // never resolves

    mockGetTrashAccounts.mockResolvedValue([
      {
        pubkey: { toBase58: () => 'pubkey1' },
        mint: { toBase58: () => 'mint1111' },
        balance: 100,
        usdValue: 0.01,
        pricePerToken: 0.0001,
        rawAmount: BigInt(100),
        decimals: 6,
      },
    ]);

    render(<Home />);
    await waitFor(() => screen.getByText('TRASH ACCOUNTS'));
    fireEvent.click(screen.getByText(/RECYCLE ALL/));
    await waitFor(() => screen.getByText(/Recycling/));
    expect(screen.getByText(/Recycling 1 accounts/)).toBeInTheDocument();
  });

  it('shows success state with reclaimed SOL after recycling', async () => {
    const { recycleAccounts: mockRecycle } = require('@/lib/recycle');
    mockRecycle.mockResolvedValue({ succeeded: 1, failed: 0, solReclaimed: 0.0019 });

    mockGetTrashAccounts.mockResolvedValue([
      {
        pubkey: { toBase58: () => 'pubkey1' },
        mint: { toBase58: () => 'mint1111' },
        balance: 100,
        usdValue: 0.01,
        pricePerToken: 0.0001,
        rawAmount: BigInt(100),
        decimals: 6,
      },
    ]);

    render(<Home />);
    await waitFor(() => screen.getByText('TRASH ACCOUNTS'));
    fireEvent.click(screen.getByText(/RECYCLE ALL/));
    await waitFor(() => screen.getByText(/Reclaimed/));
    expect(screen.getByText(/Reclaimed ~0.002 SOL/)).toBeInTheDocument();
    expect(screen.getByText('Scan Again')).toBeInTheDocument();
  });
```

- [ ] **Step 4: Run frontend tests**

```bash
npx jest --config jest.frontend.config.js
```

Expected: all tests pass including the 2 new ones (10 total).

- [ ] **Step 5: Run all tests**

```bash
npx jest --config jest.config.js && npx jest --config jest.frontend.config.js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat: wire up RECYCLE ALL button with recycling and success UI states"
```
