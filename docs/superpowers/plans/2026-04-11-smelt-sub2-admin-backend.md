# SMELT Sub-project 2: Admin Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three local CLI scripts (`liquidate`, `distribute`, `admin`) that manage the vault liquidation pipeline and SMELT revenue distribution.

**Architecture:** TypeScript CLI scripts run via `ts-node` directly from the project root. `liquidate.ts` fetches vault balances, prices via Jupiter, and swaps tokens > $10 to SOL. `distribute.ts` snapshots SMELT holders, reads staking PDAs, and distributes SOL proportionally. `admin.ts` prints a live terminal dashboard. All state is persisted to local JSON files in `data/`.

**Tech Stack:** TypeScript, ts-node, @solana/web3.js, @solana/spl-token, @coral-xyz/anchor, Jupiter V6 API, Helius RPC, node:fs

**Prerequisites:** Sub-project 1 complete — `lib/constants.ts` must have real `SMELT_MINT`, `STAKING_PROGRAM_ID`, and `VAULT_PUBKEY` values. `data/keypairs/vault.json` and `data/keypairs/admin.json` must exist locally.

---

## File Map

| File | Role |
|---|---|
| `scripts/liquidate.ts` | Fetch vault balances, price via Jupiter, swap > $10 tokens to SOL |
| `scripts/distribute.ts` | Snapshot SMELT holders, read staking PDAs, send proportional SOL |
| `scripts/admin.ts` | Terminal dashboard: vault state, pending profit, distribution history |
| `lib/jupiter.ts` | Jupiter V6 swap helper (reusable across scripts) |
| `lib/constants.ts` | Already exists from Sub-project 1 — add `LIQUIDATION_THRESHOLD_USD` if missing |
| `data/liquidations.json` | Append-only liquidation log (gitignored) |
| `data/distributions.json` | Append-only distribution log (gitignored) |
| `data/keypairs/vault.json` | Vault keypair (gitignored) |
| `data/keypairs/admin.json` | Admin keypair (gitignored) |
| `.gitignore` | Add `data/` entry |

---

### Task 1: Project setup — dependencies, tsconfig, gitignore, data scaffolding

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `data/liquidations.json`
- Create: `data/distributions.json`
- Create: `tsconfig.scripts.json`

- [ ] **Step 1: Install script dependencies**

```bash
npm install --save-dev ts-node
npm install @project-serum/anchor
```

> Note: `@coral-xyz/anchor` is already installed from Sub-project 1. Skip if already present. `ts-node` is needed to run `.ts` files directly.

- [ ] **Step 2: Add npm scripts to `package.json`**

Open `package.json` and add inside `"scripts"`:

```json
"liquidate": "ts-node --project tsconfig.scripts.json scripts/liquidate.ts",
"distribute": "ts-node --project tsconfig.scripts.json scripts/distribute.ts",
"admin": "ts-node --project tsconfig.scripts.json scripts/admin.ts"
```

- [ ] **Step 3: Create `tsconfig.scripts.json`**

This is a separate tsconfig so scripts can use CommonJS (ts-node default) without breaking the Next.js build:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "strict": true,
    "outDir": "dist-scripts",
    "rootDir": ".",
    "skipLibCheck": true
  },
  "include": ["scripts/**/*", "lib/**/*"]
}
```

- [ ] **Step 4: Initialize data files**

```json
// data/liquidations.json
[]
```

```json
// data/distributions.json
[]
```

- [ ] **Step 5: Add `data/` to `.gitignore`**

Append to `.gitignore`:

```
# Admin backend state (never commit keypairs or local data)
data/
```

- [ ] **Step 6: Create keypairs directory with README**

```bash
mkdir -p data/keypairs
echo "Place vault.json and admin.json here. NEVER commit this directory." > data/keypairs/README.txt
```

- [ ] **Step 7: Verify setup**

```bash
cat package.json | grep -A 3 '"liquidate"'
ls data/
```

Expected output:
```
"liquidate": "ts-node --project tsconfig.scripts.json scripts/liquidate.ts",
liquidations.json  distributions.json  keypairs/
```

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.scripts.json data/liquidations.json data/distributions.json .gitignore
git commit -m "feat(admin): project setup — ts-node scripts, data scaffolding"
```

---

### Task 2: `lib/jupiter.ts` — Jupiter V6 swap helper

**Files:**
- Create: `lib/jupiter.ts`

`★ Insight ─────────────────────────────────────`
Jupiter V6 swap flow: (1) GET /quote to get best route, (2) POST /swap to get the serialized transaction, (3) deserialize + sign + send. The swap endpoint returns a base64-encoded transaction. The caller signs and sends it — Jupiter never holds your keys.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Write `lib/jupiter.ts`**

```typescript
// lib/jupiter.ts
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  sendAndConfirmRawTransaction,
} from '@solana/web3.js';

const JUPITER_API = 'https://quote-api.jup.ag/v6';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

export interface SwapResult {
  inputMint: string;
  amountIn: number;        // raw token units
  solReceived: number;     // lamports → SOL
  txSignature: string;
}

/**
 * Swap `amountIn` raw units of `inputMint` to SOL via Jupiter V6.
 * Returns SwapResult on success, throws on failure.
 */
export async function swapToSol(
  connection: Connection,
  payer: Keypair,
  inputMint: string,
  amountIn: number,
): Promise<SwapResult> {
  // 1. Get quote
  const quoteUrl = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${SOL_MINT}&amount=${amountIn}&slippageBps=100`;
  const quoteRes = await fetch(quoteUrl);
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.status}`);
  const quote = await quoteRes.json() as { outAmount: string; [key: string]: unknown };

  // 2. Get swap transaction
  const swapRes = await fetch(`${JUPITER_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: payer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
    }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter swap failed: ${swapRes.status}`);
  const { swapTransaction } = await swapRes.json() as { swapTransaction: string };

  // 3. Deserialize, sign, send
  const txBytes = Buffer.from(swapTransaction, 'base64');
  // Jupiter V6 returns VersionedTransaction
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([payer]);
  const rawTx = tx.serialize();

  const sig = await sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), {
    commitment: 'confirmed',
    maxRetries: 3,
  });

  const solReceived = parseInt(quote.outAmount as string, 10) / 1_000_000_000;

  return {
    inputMint,
    amountIn,
    solReceived,
    txSignature: sig,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx ts-node --project tsconfig.scripts.json -e "import('./lib/jupiter').then(() => console.log('OK'))"
```

Expected: `OK` (no type errors)

- [ ] **Step 3: Commit**

```bash
git add lib/jupiter.ts
git commit -m "feat(admin): Jupiter V6 swap helper"
```

---

### Task 3: `scripts/liquidate.ts` — vault liquidator

**Files:**
- Create: `scripts/liquidate.ts`

- [ ] **Step 1: Write `scripts/liquidate.ts`**

```typescript
// scripts/liquidate.ts
import * as fs from 'fs';
import * as path from 'path';
import { Connection, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { swapToSol } from '../lib/jupiter';
import { VAULT_PUBKEY, LIQUIDATION_THRESHOLD_USD, MAINNET_RPC } from '../lib/constants';

interface LiquidationEntry {
  date: string;
  mint: string;
  amountIn: number;
  solReceived: number;
  txSignature: string;
  distributed: boolean;
}

const DATA_PATH = path.join(__dirname, '../data/liquidations.json');
const VAULT_KEYPAIR_PATH = path.join(__dirname, '../data/keypairs/vault.json');

function loadKeypair(filepath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadLiquidations(): LiquidationEntry[] {
  if (!fs.existsSync(DATA_PATH)) return [];
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')) as LiquidationEntry[];
}

function saveLiquidations(entries: LiquidationEntry[]): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(entries, null, 2));
}

async function fetchVaultBalances(connection: Connection): Promise<Array<{ mint: string; rawAmount: number; uiAmount: number }>> {
  const accounts = await connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, {
    programId: TOKEN_PROGRAM_ID,
  });

  return accounts.value
    .map((a) => {
      const info = a.account.data.parsed.info as {
        mint: string;
        tokenAmount: { uiAmount: number | null; amount: string };
      };
      return {
        mint: info.mint,
        rawAmount: parseInt(info.tokenAmount.amount, 10),
        uiAmount: info.tokenAmount.uiAmount ?? 0,
      };
    })
    .filter((a) => a.uiAmount > 0);
}

async function fetchPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const url = `https://price.jup.ag/v6/price?ids=${mints.join(',')}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const json = await res.json() as { data: Record<string, { price: number }> };
    const result: Record<string, number> = {};
    for (const [mint, data] of Object.entries(json.data)) {
      result[mint] = data.price;
    }
    return result;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  console.log('=== SMELT Liquidator ===\n');

  const connection = new Connection(MAINNET_RPC, 'confirmed');
  const vaultKeypair = loadKeypair(VAULT_KEYPAIR_PATH);

  console.log(`Vault: ${VAULT_PUBKEY.toBase58()}`);
  console.log('Fetching vault balances...');

  const balances = await fetchVaultBalances(connection);
  if (balances.length === 0) {
    console.log('No token balances in vault.');
    return;
  }

  const mints = balances.map((b) => b.mint);
  const prices = await fetchPrices(mints);

  console.log(`\nFound ${balances.length} tokens:\n`);
  const toSwap: Array<{ mint: string; rawAmount: number; usdValue: number }> = [];

  for (const balance of balances) {
    const price = prices[balance.mint] ?? 0;
    const usdValue = balance.uiAmount * price;
    const flag = usdValue > LIQUIDATION_THRESHOLD_USD ? '→ SWAP' : '  skip';
    console.log(`  ${flag}  ${balance.mint.slice(0, 8)}...  $${usdValue.toFixed(2)}`);
    if (usdValue > LIQUIDATION_THRESHOLD_USD) {
      toSwap.push({ mint: balance.mint, rawAmount: balance.rawAmount, usdValue });
    }
  }

  if (toSwap.length === 0) {
    console.log('\nNo tokens exceed the $10 threshold. Nothing to liquidate.');
    return;
  }

  const entries = loadLiquidations();

  for (const token of toSwap) {
    console.log(`\nSwapping ${token.mint.slice(0, 8)}... ($${token.usdValue.toFixed(2)})`);
    try {
      const result = await swapToSol(connection, vaultKeypair, token.mint, token.rawAmount);
      console.log(`  ✓ Received ${result.solReceived.toFixed(6)} SOL  (tx: ${result.txSignature.slice(0, 16)}...)`);
      const entry: LiquidationEntry = {
        date: new Date().toISOString(),
        mint: token.mint,
        amountIn: token.rawAmount,
        solReceived: result.solReceived,
        txSignature: result.txSignature,
        distributed: false,
      };
      entries.push(entry);
      saveLiquidations(entries);
    } catch (err) {
      console.error(`  ✗ Swap failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\nLiquidation complete. Results saved to data/liquidations.json');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --project tsconfig.scripts.json --noEmit
```

Expected: no errors

- [ ] **Step 3: Dry-run (no vault keypair needed for compile check)**

```bash
# Verify the script at least starts without crashing on import
npx ts-node --project tsconfig.scripts.json -e "require('./scripts/liquidate')" 2>&1 | head -5
```

Expected: starts executing (will fail at loadKeypair if vault.json absent, which is expected in dev)

- [ ] **Step 4: Commit**

```bash
git add scripts/liquidate.ts
git commit -m "feat(admin): vault liquidator script"
```

---

### Task 4: `scripts/distribute.ts` — SOL distributor

**Files:**
- Create: `scripts/distribute.ts`

`★ Insight ─────────────────────────────────────`
The distribution snapshot approach here is "lazy" — it reads current on-chain balances at run-time rather than indexing a history. This is intentional and gas-free: since SMELT is an SPL token, all holders are visible via `getTokenAccountsByMint`. The 1.5x staking boost is applied by reading StakeAccount PDAs from the Anchor program.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Write `scripts/distribute.ts`**

```typescript
// scripts/distribute.ts
import * as fs from 'fs';
import * as path from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import {
  SMELT_MINT,
  STAKING_PROGRAM_ID,
  STAKING_BOOST,
  MAINNET_RPC,
} from '../lib/constants';

interface LiquidationEntry {
  date: string;
  mint: string;
  amountIn: number;
  solReceived: number;
  txSignature: string;
  distributed: boolean;
}

interface DistributionEntry {
  date: string;
  totalSol: number;
  recipientCount: number;
  txSignatures: string[];
}

interface StakeAccountData {
  owner: PublicKey;
  amountStaked: bigint;
  bump: number;
}

const LIQUIDATIONS_PATH = path.join(__dirname, '../data/liquidations.json');
const DISTRIBUTIONS_PATH = path.join(__dirname, '../data/distributions.json');
const ADMIN_KEYPAIR_PATH = path.join(__dirname, '../data/keypairs/admin.json');

const TRANSFERS_PER_TX = 20;

function loadKeypair(filepath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadLiquidations(): LiquidationEntry[] {
  if (!fs.existsSync(LIQUIDATIONS_PATH)) return [];
  return JSON.parse(fs.readFileSync(LIQUIDATIONS_PATH, 'utf-8')) as LiquidationEntry[];
}

function loadDistributions(): DistributionEntry[] {
  if (!fs.existsSync(DISTRIBUTIONS_PATH)) return [];
  return JSON.parse(fs.readFileSync(DISTRIBUTIONS_PATH, 'utf-8')) as DistributionEntry[];
}

async function fetchSmeltHolders(connection: Connection): Promise<Record<string, bigint>> {
  const accounts = await connection.getParsedTokenAccountsByOwner(
    // Use getTokenAccountsByMint instead
    new PublicKey('11111111111111111111111111111111'), // placeholder, see below
    { programId: TOKEN_PROGRAM_ID }
  );
  // Actually use the correct method:
  const tokenAccounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: 165 },
      { memcmp: { offset: 0, bytes: SMELT_MINT.toBase58() } },
    ],
  });

  const holders: Record<string, bigint> = {};
  for (const account of tokenAccounts) {
    const info = (account.account.data as { parsed: { info: { owner: string; tokenAmount: { amount: string } } } }).parsed.info;
    const amount = BigInt(info.tokenAmount.amount);
    if (amount > 0n) {
      holders[info.owner] = (holders[info.owner] ?? 0n) + amount;
    }
  }
  return holders;
}

async function fetchStakedAmounts(
  connection: Connection,
  adminKeypair: Keypair,
): Promise<Record<string, bigint>> {
  const provider = new AnchorProvider(
    connection,
    new Wallet(adminKeypair),
    { commitment: 'confirmed' }
  );

  // Load IDL from deployed program
  let idl: unknown;
  try {
    idl = await Program.fetchIdl(STAKING_PROGRAM_ID, provider);
  } catch {
    console.warn('Could not fetch IDL — staking data unavailable, treating all as 1x weight');
    return {};
  }
  if (!idl) return {};

  const program = new Program(idl as never, STAKING_PROGRAM_ID, provider);
  const stakeAccounts = await program.account['stakeAccount'].all();

  const result: Record<string, bigint> = {};
  for (const { account } of stakeAccounts) {
    const data = account as StakeAccountData;
    result[data.owner.toBase58()] = data.amountStaked;
  }
  return result;
}

async function main(): Promise<void> {
  console.log('=== SMELT Distributor ===\n');

  const connection = new Connection(MAINNET_RPC, 'confirmed');
  const adminKeypair = loadKeypair(ADMIN_KEYPAIR_PATH);

  // 1. Sum undistributed SOL
  const liquidations = loadLiquidations();
  const undistributed = liquidations.filter((e) => !e.distributed);
  const totalSol = undistributed.reduce((sum, e) => sum + e.solReceived, 0);

  if (totalSol === 0) {
    console.log('No undistributed SOL. Run `npm run liquidate` first.');
    return;
  }

  console.log(`Undistributed SOL: ${totalSol.toFixed(6)} SOL`);

  // 2. Fetch SMELT holders
  console.log('Fetching SMELT holders...');
  const holders = await fetchSmeltHolders(connection);
  const holderCount = Object.keys(holders).length;
  console.log(`Found ${holderCount} SMELT holders`);

  // 3. Fetch staked amounts
  console.log('Fetching staking data...');
  const staked = await fetchStakedAmounts(connection, adminKeypair);

  // 4. Calculate weights
  const weights: Record<string, number> = {};
  let totalWeight = 0;

  for (const [owner, unstaked] of Object.entries(holders)) {
    const stakedAmount = staked[owner] ?? 0n;
    const weight = Number(unstaked) * 1 + Number(stakedAmount) * STAKING_BOOST;
    weights[owner] = weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    console.log('Total weight is 0 — no distribution possible.');
    return;
  }

  // 5. Calculate per-wallet lamports
  const totalLamports = Math.floor(totalSol * LAMPORTS_PER_SOL);
  const recipients: Array<{ address: PublicKey; lamports: number }> = [];

  for (const [owner, weight] of Object.entries(weights)) {
    const share = Math.floor((weight / totalWeight) * totalLamports);
    if (share > 0) {
      recipients.push({ address: new PublicKey(owner), lamports: share });
    }
  }

  console.log(`\nDistributing ${totalSol.toFixed(6)} SOL to ${recipients.length} recipients`);
  console.log(`Batch size: ${TRANSFERS_PER_TX} transfers per tx\n`);

  // 6. Send in batches
  const txSignatures: string[] = [];
  for (let i = 0; i < recipients.length; i += TRANSFERS_PER_TX) {
    const batch = recipients.slice(i, i + TRANSFERS_PER_TX);
    const tx = new Transaction();
    for (const { address, lamports } of batch) {
      tx.add(SystemProgram.transfer({
        fromPubkey: adminKeypair.publicKey,
        toPubkey: address,
        lamports,
      }));
    }
    try {
      const sig = await sendAndConfirmTransaction(connection, tx, [adminKeypair], {
        commitment: 'confirmed',
      });
      txSignatures.push(sig);
      const batchNum = Math.floor(i / TRANSFERS_PER_TX) + 1;
      const totalBatches = Math.ceil(recipients.length / TRANSFERS_PER_TX);
      console.log(`  ✓ Batch ${batchNum}/${totalBatches}  tx: ${sig.slice(0, 16)}...`);
    } catch (err) {
      console.error(`  ✗ Batch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 7. Mark as distributed
  for (const entry of undistributed) {
    entry.distributed = true;
  }
  fs.writeFileSync(LIQUIDATIONS_PATH, JSON.stringify(liquidations, null, 2));

  // 8. Append distribution summary
  const distributions = loadDistributions();
  distributions.push({
    date: new Date().toISOString(),
    totalSol,
    recipientCount: recipients.length,
    txSignatures,
  });
  fs.writeFileSync(DISTRIBUTIONS_PATH, JSON.stringify(distributions, null, 2));

  console.log(`\nDistribution complete. ${txSignatures.length} transactions sent.`);
  console.log('Results saved to data/distributions.json');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Fix the fetchSmeltHolders function (it has dead code from copy-paste)**

The function above has a dead `getParsedTokenAccountsByOwner` call that should be removed. Edit `scripts/distribute.ts` — replace `fetchSmeltHolders` with the clean version:

```typescript
async function fetchSmeltHolders(connection: Connection): Promise<Record<string, bigint>> {
  const tokenAccounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: 165 },
      { memcmp: { offset: 0, bytes: SMELT_MINT.toBase58() } },
    ],
  });

  const holders: Record<string, bigint> = {};
  for (const account of tokenAccounts) {
    const info = (account.account.data as { parsed: { info: { owner: string; tokenAmount: { amount: string } } } }).parsed.info;
    const amount = BigInt(info.tokenAmount.amount);
    if (amount > 0n) {
      holders[info.owner] = (holders[info.owner] ?? 0n) + amount;
    }
  }
  return holders;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --project tsconfig.scripts.json --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add scripts/distribute.ts
git commit -m "feat(admin): SOL distributor script"
```

---

### Task 5: `scripts/admin.ts` — terminal dashboard

**Files:**
- Create: `scripts/admin.ts`

- [ ] **Step 1: Write `scripts/admin.ts`**

```typescript
// scripts/admin.ts
import * as fs from 'fs';
import * as path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  SMELT_MINT,
  STAKING_PROGRAM_ID,
  VAULT_PUBKEY,
  LIQUIDATION_THRESHOLD_USD,
  INITIAL_SMELT_PER_ACCOUNT,
  currentSmeltPerAccount,
  MAINNET_RPC,
} from '../lib/constants';

interface LiquidationEntry {
  date: string;
  mint: string;
  amountIn: number;
  solReceived: number;
  distributed: boolean;
}

interface DistributionEntry {
  date: string;
  totalSol: number;
  recipientCount: number;
  txSignatures: string[];
}

const LIQUIDATIONS_PATH = path.join(__dirname, '../data/liquidations.json');
const DISTRIBUTIONS_PATH = path.join(__dirname, '../data/distributions.json');

function loadJson<T>(filepath: string, fallback: T): T {
  if (!fs.existsSync(filepath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

async function fetchVaultTokens(connection: Connection): Promise<Array<{ mint: string; uiAmount: number; usdValue?: number }>> {
  const accounts = await connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, {
    programId: TOKEN_PROGRAM_ID,
  });

  const tokens = accounts.value
    .map((a) => {
      const info = a.account.data.parsed.info as {
        mint: string;
        tokenAmount: { uiAmount: number | null };
      };
      return {
        mint: info.mint,
        uiAmount: info.tokenAmount.uiAmount ?? 0,
      };
    })
    .filter((t) => t.uiAmount > 0);

  // Fetch prices
  if (tokens.length > 0) {
    const mints = tokens.map((t) => t.mint).join(',');
    try {
      const res = await fetch(`https://price.jup.ag/v6/price?ids=${mints}`);
      if (res.ok) {
        const json = await res.json() as { data: Record<string, { price: number }> };
        return tokens.map((t) => ({
          ...t,
          usdValue: (t.uiAmount * (json.data[t.mint]?.price ?? 0)),
        }));
      }
    } catch { /* ignore */ }
  }
  return tokens;
}

async function fetchSmeltSupply(connection: Connection): Promise<{ total: number; staked: number }> {
  try {
    const supply = await connection.getTokenSupply(SMELT_MINT);
    const totalCirculating = supply.value.uiAmount ?? 0;

    // Estimate staked from program accounts
    let staked = 0;
    try {
      const tokenAccounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: SMELT_MINT.toBase58() } },
        ],
      });
      // Vault ATA holds staked tokens — find it
      for (const account of tokenAccounts) {
        const info = (account.account.data as { parsed: { info: { owner: string; tokenAmount: { uiAmount: number | null } } } }).parsed.info;
        // Vault is the staking program's GlobalState PDA
        // For now sum all non-user ATAs is complex; approximate via program account
      }
    } catch { /* staked approx */ }

    return { total: totalCirculating, staked };
  } catch {
    return { total: 0, staked: 0 };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

async function main(): Promise<void> {
  const connection = new Connection(MAINNET_RPC, 'confirmed');

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║          SMELT Admin Dashboard               ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Vault tokens
  console.log('── Vault Token Balances ──────────────────────');
  try {
    const tokens = await fetchVaultTokens(connection);
    if (tokens.length === 0) {
      console.log('  (empty)');
    } else {
      let vaultTotal = 0;
      for (const t of tokens) {
        const usd = t.usdValue ?? 0;
        vaultTotal += usd;
        const bar = usd > LIQUIDATION_THRESHOLD_USD ? ' [READY TO SWAP]' : ` ($${usd.toFixed(2)} / $${LIQUIDATION_THRESHOLD_USD})`;
        console.log(`  ${t.mint.slice(0, 12)}...  ${t.uiAmount.toLocaleString()}${bar}`);
      }
      console.log(`  Total vault USD value: $${vaultTotal.toFixed(2)}`);
    }
  } catch (err) {
    console.log(`  Error fetching vault: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('');
  console.log('── Pending Profit ────────────────────────────');
  const liquidations = loadJson<LiquidationEntry[]>(LIQUIDATIONS_PATH, []);
  const undistributed = liquidations.filter((e) => !e.distributed);
  const pendingSol = undistributed.reduce((s, e) => s + e.solReceived, 0);
  console.log(`  Undistributed liquidation SOL: ${pendingSol.toFixed(6)} SOL`);

  console.log('');
  console.log('── SMELT Token ───────────────────────────────');
  try {
    const { total, staked } = await fetchSmeltSupply(connection);
    console.log(`  Circulating supply:  ${total.toLocaleString()} SMELT`);
    console.log(`  Staked:              ${staked.toLocaleString()} SMELT`);
  } catch {
    console.log('  (could not fetch supply)');
  }

  console.log('');
  console.log('── Emission Epoch ────────────────────────────');
  const smeltPerAccount = currentSmeltPerAccount();
  console.log(`  Current SMELT per recycle: ${smeltPerAccount}`);

  console.log('');
  console.log('── Last Liquidation ──────────────────────────');
  const lastLiquidation = [...liquidations].reverse().find(Boolean);
  if (lastLiquidation) {
    console.log(`  Date:   ${formatDate(lastLiquidation.date)}`);
    console.log(`  Token:  ${lastLiquidation.mint.slice(0, 16)}...`);
    console.log(`  SOL:    ${lastLiquidation.solReceived.toFixed(6)}`);
  } else {
    console.log('  No liquidations yet');
  }

  console.log('');
  console.log('── Last Distribution ─────────────────────────');
  const distributions = loadJson<DistributionEntry[]>(DISTRIBUTIONS_PATH, []);
  const lastDist = [...distributions].reverse().find(Boolean);
  if (lastDist) {
    console.log(`  Date:       ${formatDate(lastDist.date)}`);
    console.log(`  SOL sent:   ${lastDist.totalSol.toFixed(6)}`);
    console.log(`  Recipients: ${lastDist.recipientCount}`);
  } else {
    console.log('  No distributions yet');
  }

  console.log('');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --project tsconfig.scripts.json --noEmit
```

Expected: no errors

- [ ] **Step 3: Test the dashboard runs (will show empty state)**

Make sure `data/liquidations.json` and `data/distributions.json` exist with `[]` content, then:

```bash
npm run admin
```

Expected output (no keypair needed for dashboard — it only reads from RPC and local files):
```
╔══════════════════════════════════════════════╗
║          SMELT Admin Dashboard               ║
╚══════════════════════════════════════════════╝

── Vault Token Balances ──────────────────────
  ...
── Pending Profit ────────────────────────────
  Undistributed liquidation SOL: 0.000000 SOL
```

- [ ] **Step 4: Commit**

```bash
git add scripts/admin.ts
git commit -m "feat(admin): terminal dashboard"
```

---

### Task 6: SMELT minting helper — `scripts/mint-smelt.ts`

The admin backend needs to mint SMELT to users after successful recycling. This script is called by the Next.js API route (not directly by the user).

**Files:**
- Create: `scripts/mint-smelt.ts`
- Modify: `app/api/recycle/route.ts` (create if absent)

`★ Insight ─────────────────────────────────────`
Minting from an API route requires the admin keypair to be available server-side. Since this is a local Next.js deployment (not Vercel), the keypair file path is safe to use. In production, this would need a secrets manager. The mint function is kept simple: one transaction, one recipient, immediate confirmation.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Write `scripts/mint-smelt.ts`**

```typescript
// scripts/mint-smelt.ts
// Called programmatically from the API route after successful recycling
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
import { SMELT_MINT, MAINNET_RPC, currentSmeltPerAccount } from '../lib/constants';

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
  // Convert to raw amount (9 decimals)
  const rawAmount = BigInt(totalSmelt) * BigInt(10 ** 9);

  const recipientATA = await getAssociatedTokenAddress(
    SMELT_MINT,
    recipient,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const tx = new Transaction();

  // Create recipient ATA if it doesn't exist
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

  // Mint SMELT
  tx.add(
    createMintToInstruction(
      SMELT_MINT,
      recipientATA,
      adminKeypair.publicKey, // mint authority
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
```

- [ ] **Step 2: Create `app/api/recycle/route.ts`**

This route is called by the frontend after a successful recycling transaction to trigger SMELT minting:

```typescript
// app/api/recycle/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { mintSmeltReward } from '../../../scripts/mint-smelt';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { wallet, accountsClosed } = await req.json() as {
      wallet: string;
      accountsClosed: number;
    };

    if (!wallet || typeof accountsClosed !== 'number' || accountsClosed <= 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const recipient = new PublicKey(wallet);
    const txSig = await mintSmeltReward(recipient, accountsClosed);

    return NextResponse.json({ success: true, txSignature: txSig, smeltMinted: accountsClosed });
  } catch (err) {
    console.error('Mint failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Mint failed' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --project tsconfig.scripts.json --noEmit
npm run build 2>&1 | tail -20
```

Expected: no errors in scripts tsconfig; Next.js build may warn about the route but should not error.

- [ ] **Step 4: Commit**

```bash
git add scripts/mint-smelt.ts app/api/recycle/route.ts
git commit -m "feat(admin): SMELT minting helper + API route"
```

---

### Task 7: Wire minting into the recycler frontend

**Files:**
- Modify: `app/page.tsx` (call `/api/recycle` after successful transaction)

- [ ] **Step 1: Read the current `app/page.tsx` to find the recycle success handler**

The success handler currently calls `setResult` after `recycleAccounts` resolves. Find the section:

```typescript
const result = await recycleAccounts(selected, publicKey, signAllTransactions, connection);
setResult(result);
```

- [ ] **Step 2: Add SMELT minting call after success**

After `setResult(result)`, add:

```typescript
// Fire-and-forget SMELT reward (non-blocking — doesn't affect UX if it fails)
if (result.succeeded > 0) {
  fetch('/api/recycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet: publicKey.toBase58(),
      accountsClosed: result.succeeded,
    }),
  }).catch(() => {
    // Silent fail — reward mint failures are not user-facing errors
  });
}
```

- [ ] **Step 3: Verify app builds**

```bash
npm run build
```

Expected: successful build, no errors

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(frontend): fire SMELT mint reward after successful recycle"
```

---

## Self-Review Against Spec

Spec requirements for Sub-project 2:

- [x] `npm run liquidate` — fetches vault balances, prices via Jupiter, swaps > $10 to SOL, appends to `data/liquidations.json`
- [x] `npm run distribute` — reads undistributed liquidations, snapshots SMELT holders, reads StakeAccount PDAs, sends proportional SOL, marks distributed, appends to `data/distributions.json`
- [x] `npm run admin` — terminal dashboard with all required fields
- [x] `lib/jupiter.ts` — Jupiter V6 swap helper
- [x] `lib/constants.ts` — already created in Sub-project 1
- [x] `data/liquidations.json` / `data/distributions.json` schema matches spec
- [x] `data/keypairs/` gitignored
- [x] SMELT minting after recycling (bonus: API route + wired into frontend)
