# Recycle Transaction — Design Spec

## Goal

Wire up the "RECYCLE ALL" button to execute real Solana transactions: transfer dust tokens to the Vault, close the token accounts, and return reclaimed SOL to the user minus a 5% platform fee.

---

## Section 1: Architecture & Files

### Files changed

| File | Change |
|------|--------|
| `lib/solana.ts` | Extend `TrashAccount` with `rawAmount: bigint` and `decimals: number` |
| `lib/recycle.ts` | **New** — `recycleAccounts()` function |
| `app/page.tsx` | Replace `alert()` with `recycleAccounts` call; add `recycling` and `success` statuses |
| `lib/__tests__/recycle.test.ts` | **New** — unit tests for `recycleAccounts` |

### Constants

- **VAULT**: `DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z`
- **Batch size**: 5 accounts per transaction
- **Fee per account**: `0.002 * 0.05 SOL` = `Math.ceil(0.002 * 0.05 * LAMPORTS_PER_SOL)` lamports to Vault
- **Retry**: up to 3× with 1.5s delay between attempts

### `recycleAccounts` signature

```typescript
export async function recycleAccounts(
  accounts: TrashAccount[],
  owner: PublicKey,
  signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>,
  connection: Connection,
): Promise<{ succeeded: number; failed: number; solReclaimed: number }>
```

---

## Section 2: Transaction Building & Data Flow

### Per-call sequence

1. Fetch one blockhash — reused across all transactions
2. Split `accounts` into chunks of 5
3. For each chunk, build one `Transaction` with instructions in this order:
   1. `createAssociatedTokenAccountIdempotent` — Vault ATA for the mint (idempotent, safe if exists)
   2. `transferChecked` — move `rawAmount` tokens from user's ATA → Vault ATA
   3. `closeAccount` — close user's ATA, SOL rent returns to user's wallet
   4. `SystemProgram.transfer` — `Math.ceil(batchSize * 0.002 * 0.05 * LAMPORTS_PER_SOL)` lamports from user → Vault
4. Call `signAllTransactions(allTxs)` — single Phantom popup
5. Send all signed transactions in parallel via `connection.sendRawTransaction`
6. Confirm each with `connection.confirmTransaction` at `"confirmed"` commitment
7. Retry failed transactions up to 3× with 1.5s backoff
8. Return `{ succeeded, failed, solReclaimed: succeeded * 0.002 * 0.95 }`

---

## Section 3: Error Handling, UI Changes & Testing

### Error handling

- `signAllTransactions` throws (user rejects Phantom) → `recycleAccounts` re-throws; `page.tsx` catches, resets status to `results`, shows "Transaction cancelled"
- Batch fails all 3 retries → count as `failed`, continue with remaining batches (partial success is valid)
- ATA creation or transfer fails → mark batch as failed, retry normally

### UI states added to `page.tsx`

```
disconnected → scanning → results → [RECYCLE ALL] → recycling → success
                                                   ↘ results (if rejected)
```

- **`recycling`**: spinner + "Recycling X accounts… (Y/Z batches done)"
- **`success`**: "✓ Reclaimed ~{solReclaimed} SOL from {succeeded} accounts" + "Scan Again" button
- If `failed > 0`: amber warning alongside success message

### Tests (`lib/__tests__/recycle.test.ts`)

- **Happy path**: 5 accounts → 1 transaction, `signAllTransactions` called once, correct `solReclaimed`
- **Partial failure**: batch 1 succeeds, batch 2 fails all retries → `{ succeeded: 5, failed: 5, solReclaimed }`
- **User rejection**: `signAllTransactions` throws → `recycleAccounts` re-throws
- **Fee instruction**: verify `SystemProgram.transfer` lamports = `Math.ceil(5 * 0.002 * 0.05 * 1e9)`
