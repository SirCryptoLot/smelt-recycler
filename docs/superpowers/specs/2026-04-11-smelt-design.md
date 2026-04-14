# SMELT — Design Spec

**Date:** 2026-04-11
**Status:** Approved

---

## Goal

Extend the Solana dust recycler into a full product with its own reward token ($SMELT). Users earn SMELT by recycling dust and empty token accounts. Holding SMELT entitles users to a weekly share of vault liquidation profits (SOL). Staking SMELT gives a 1.5× distribution boost. The system is built in three independent sub-projects, each with its own spec → plan → build cycle.

---

## Token Economics

**Name:** SMELT
**Standard:** SPL Token, 9 decimals
**Fixed supply:** 1,000,000,000 (1 billion)

| Allocation | Amount | Purpose |
|---|---|---|
| Rewards treasury | 600,000,000 (60%) | Recycling emissions, held by admin keypair |
| Team | 200,000,000 (20%) | Team allocation |
| Ecosystem | 200,000,000 (20%) | Future use, partnerships |

**Emission schedule — time-based halving:**

| Epoch | Period | SMELT per account recycled |
|---|---|---|
| 1 | Months 0–6 | 1,000 |
| 2 | Months 6–12 | 500 |
| 3 | Months 12–18 | 250 |
| 4 | Months 18–24 | 125 |
| 5+ | Every 6 months | halves again |

- Emission applies per account closed (both dust and empty accounts)
- Admin backend mints SMELT to the user immediately after recycling transaction confirms
- Minting authority = admin keypair (can be burned to make supply immutable in future)

**Revenue share mechanics:**
- Distribution runs weekly, triggered manually via `npm run distribute`
- Snapshot taken of all on-chain SMELT holders at distribution time
- Staked SMELT counts as 1.5× weight; unstaked counts as 1×
- Formula: `user_share = user_weight / total_weight × total_sol_profit`
- Distributed as SOL via batched `SystemProgram.transfer` transactions

---

## Architecture Overview

Three independent sub-projects built in order:

```
Sub-project 1: SMELT Token + Anchor Staking Program
Sub-project 2: Admin Backend (liquidator + distributor + dashboard)
Sub-project 3: Frontend Expansion (staking UI + pools page)
```

Each depends on the previous. Sub-project 1 is the foundation.

---

## Sub-project 1: SMELT Token + Anchor Staking Program

### Token setup (one-time)
- Create SPL token with 9 decimals, 1B supply minted to admin keypair
- Store mint address in `lib/constants.ts`

### Anchor program: `smelt_staking`

**Purpose:** Record which wallets have staked SMELT and how much. The admin backend reads this to calculate distribution weights. Users stake/unstake freely with no lock period.

**Program accounts (PDAs):**

`GlobalState` — one per program
Seeds: `["global"]`
```rust
pub struct GlobalState {
    pub admin: Pubkey,
    pub smelt_mint: Pubkey,
    pub total_staked: u64,
    pub bump: u8,
}
```

`StakeAccount` — one per user wallet
Seeds: `["stake", owner.key()]`
```rust
pub struct StakeAccount {
    pub owner: Pubkey,
    pub amount_staked: u64,
    pub bump: u8,
}
```

**Vault ATA:** Program holds staked SMELT in its own ATA, owned by `GlobalState` PDA.

**Instructions:**

`initialize(admin: Pubkey, smelt_mint: Pubkey)`
- Called once at deploy
- Creates `GlobalState` PDA
- Creates vault ATA owned by GlobalState

`stake(amount: u64)`
- Transfers `amount` SMELT from user's wallet → vault ATA
- Creates `StakeAccount` if it doesn't exist
- Increments `StakeAccount.amount_staked` and `GlobalState.total_staked`

`unstake(amount: u64)`
- Validates `StakeAccount.amount_staked >= amount`
- Transfers `amount` SMELT from vault ATA → user's wallet
- Decrements both counters

**No lock period, no penalty.** The 1.5× boost is applied at distribution snapshot time only.

**Files:**
- `programs/smelt_staking/src/lib.rs` — Anchor program
- `programs/smelt_staking/src/state.rs` — account structs
- `programs/smelt_staking/src/instructions/` — one file per instruction
- `tests/smelt_staking.ts` — Anchor test suite (initialize, stake, unstake, edge cases)

---

## Sub-project 2: Admin Backend

Local Node.js/TypeScript CLI. Three commands.

### `npm run liquidate`
1. Fetches all vault token balances via Helius RPC
2. Prices each token via Jupiter Price API v2
3. For tokens where `balance × price > $10`: executes Jupiter V6 swap to SOL
4. Signs swap transaction with vault keypair
5. Appends result to `data/liquidations.json`:
```json
{
  "date": "2026-04-18T12:00:00Z",
  "mint": "...",
  "amountIn": 1000000,
  "solReceived": 0.045,
  "distributed": false
}
```

### `npm run distribute`
1. Reads `data/liquidations.json` — sums all entries where `distributed: false`
2. Fetches all SMELT token holders via Helius DAS `getTokenAccounts`
3. Reads `GlobalState.total_staked` + all `StakeAccount` PDAs from Anchor program
4. Calculates per-wallet weight: `unstaked_smelt × 1 + staked_smelt × 1.5`
5. Sends SOL to every holder proportionally, batched in transactions of 20 transfers
6. Marks distributed entries in `data/liquidations.json` as `distributed: true`
7. Appends summary to `data/distributions.json`:
```json
{
  "date": "2026-04-18T12:00:00Z",
  "totalSol": 1.23,
  "recipientCount": 847,
  "txSignatures": ["..."]
}
```

### `npm run admin`
Terminal dashboard (console output):
- Vault token balances + USD values
- Undistributed SOL profit (sum of unliquidated + undistributed)
- Total SMELT staked / total supply in circulation
- Last liquidation date + amount
- Last distribution date + amount + recipient count
- Current emission epoch + SMELT per recycle

**Local state files (gitignored):**
```
data/
  liquidations.json
  distributions.json
  keypairs/
    vault.json     — vault keypair (gitignored, never committed)
    admin.json     — admin keypair (gitignored, never committed)
```

**New files:**
- `scripts/liquidate.ts`
- `scripts/distribute.ts`
- `scripts/admin.ts`
- `lib/jupiter.ts` — Jupiter V6 swap helper (reusable)
- `lib/constants.ts` — SMELT mint, vault pubkey, program ID, thresholds

---

## Sub-project 3: Frontend Expansion

### Navigation
Two-tab header added to the main layout:
- `♻ Recycle` — existing recycler (unchanged)
- `🏊 Pools` — new pools page

### Sidebar additions (connected wallet)
Below existing wallet/stats cards:
- **SMELT balance** — fetched from user's SMELT token account
- **Staked** — read from user's `StakeAccount` PDA (0 if no account)
- **"1.5× active"** badge shown when `staked > 0`
- **Stake / Unstake** button → opens inline stake panel

### Stake panel (inline, same page)
- Input: amount to stake or unstake (toggleable)
- Shows: wallet SMELT balance, currently staked, resulting boost
- On submit: calls Anchor `stake` or `unstake` instruction via `@coral-xyz/anchor`
- Single wallet approval, optimistic UI update

### `/pools` page (`app/pools/page.tsx`)

**Vault contents section:**
- Table: token symbol, balance, USD value, progress bar toward $10 threshold
- Fetched from Helius RPC (vault token accounts) + Jupiter prices

**Liquidation history:**
- Last 5 liquidations from `data/liquidations.json` (served via Next.js API route)
- Shows: date, token, SOL received

**Distribution stats:**
- Next estimated distribution (weekly from last run)
- Your estimated share (based on current SMELT balance + stake)
- Total SOL distributed to date

**Your stats:**
- Total SMELT earned (from wallet balance + staking history)
- Total SOL received from distributions
- Accounts recycled (count, read from `data/distributions.json`)

### New API routes
- `GET /api/vault` — returns vault balances + USD values
- `GET /api/stats` — returns liquidation + distribution summaries from local JSON files

### New lib files
- `lib/smelt.ts` — fetch SMELT balance, build stake/unstake transactions
- `lib/pools.ts` — fetch vault balances, read distribution data

---

## Key Constants (`lib/constants.ts`)

```typescript
export const SMELT_MINT = new PublicKey('...');         // set after token creation
export const STAKING_PROGRAM_ID = new PublicKey('...'); // set after program deploy
export const VAULT = new PublicKey('DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z');
export const LIQUIDATION_THRESHOLD_USD = 10;
export const TRASH_THRESHOLD_USD = 0.10;
export const PLATFORM_FEE_BPS = 500; // 5%
export const STAKING_BOOST = 1.5;

// Emission schedule
export const EPOCH_DURATION_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months
export const INITIAL_SMELT_PER_ACCOUNT = 1000;
export const PROGRAM_START_TIMESTAMP = 0; // set at launch
```

---

## Build Order

1. **Sub-project 1** — Anchor program + token creation + tests
2. **Sub-project 2** — Admin backend scripts
3. **Sub-project 3** — Frontend (staking UI + pools page)

Sub-projects 2 and 3 can be partially parallelized once the program ID and SMELT mint are known from Sub-project 1.
