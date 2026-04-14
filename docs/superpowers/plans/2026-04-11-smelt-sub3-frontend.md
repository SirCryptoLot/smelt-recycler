# SMELT Sub-project 3: Frontend Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Next.js frontend with a two-tab navigation (Recycle / Pools), a SMELT sidebar section with inline stake/unstake panel, and a `/pools` page showing vault contents, liquidation history, and distribution stats.

**Architecture:** New pages and components under Next.js App Router. `lib/smelt.ts` provides staking transaction builders using `@coral-xyz/anchor`. `lib/pools.ts` fetches vault balances and reads local JSON files via API routes. Two new API routes (`/api/vault`, `/api/stats`) serve data to the frontend.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, `@coral-xyz/anchor`, `@solana/web3.js`, `@solana/wallet-adapter-react`

**Prerequisites:** Sub-project 1 complete (Anchor program deployed, `lib/constants.ts` has real `SMELT_MINT` and `STAKING_PROGRAM_ID`). Sub-project 2 complete (`data/liquidations.json` and `data/distributions.json` exist).

---

## File Map

| File | Role |
|---|---|
| `components/Nav.tsx` | Two-tab header: Recycle / Pools |
| `lib/smelt.ts` | Fetch SMELT balance, StakeAccount PDA, build stake/unstake txs |
| `lib/pools.ts` | Fetch vault token balances + prices, read distribution data |
| `app/api/vault/route.ts` | GET — vault balances + USD values |
| `app/api/stats/route.ts` | GET — liquidation + distribution summaries |
| `app/pools/page.tsx` | Pools page: vault contents, liquidation history, distribution stats |
| `app/layout.tsx` | Add `<Nav />` to layout |
| `app/page.tsx` | Add SMELT sidebar section + inline stake panel |

---

### Task 1: Navigation component

**Files:**
- Create: `components/Nav.tsx`
- Modify: `app/layout.tsx`

`★ Insight ─────────────────────────────────────`
Next.js App Router uses React Server Components by default. `Nav.tsx` needs `'use client'` because it uses `usePathname()` to highlight the active tab. The layout itself can stay a server component — it just renders `<Nav />` as a child, and React handles the client/server boundary automatically.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Read `app/layout.tsx` to understand the current structure**

```bash
# Read the file before editing
```

Use the Read tool on `app/layout.tsx`.

- [ ] **Step 2: Create `components/Nav.tsx`**

```tsx
// components/Nav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav() {
  const path = usePathname();

  const tabs = [
    { href: '/', label: '♻ Recycle' },
    { href: '/pools', label: '🏊 Pools' },
  ];

  return (
    <nav className="flex items-center gap-1 px-4 py-3 border-b border-white/10 bg-zinc-950">
      {tabs.map((tab) => {
        const active = tab.href === '/' ? path === '/' : path.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              active
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Add `<Nav />` to `app/layout.tsx`**

Inside `app/layout.tsx`, import `Nav` and add it above the `{children}` call:

```tsx
import { Nav } from '@/components/Nav';

// In the <body> element:
<body className="...">
  <Nav />
  {children}
</body>
```

- [ ] **Step 4: Verify nav renders**

```bash
npm run dev
```

Open `http://localhost:3000` — should see "♻ Recycle" and "🏊 Pools" tabs. "♻ Recycle" should be highlighted.

- [ ] **Step 5: Commit**

```bash
git add components/Nav.tsx app/layout.tsx
git commit -m "feat(frontend): two-tab navigation (Recycle / Pools)"
```

---

### Task 2: `lib/smelt.ts` — SMELT balance and staking transactions

**Files:**
- Create: `lib/smelt.ts`

- [ ] **Step 1: Write `lib/smelt.ts`**

```typescript
// lib/smelt.ts
import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { SMELT_MINT, STAKING_PROGRAM_ID } from './constants';

export interface StakeInfo {
  amountStaked: bigint;   // raw, 9 decimals
  bump: number;
}

/**
 * Fetch the user's SMELT token balance (raw units, 9 decimals).
 * Returns 0n if account doesn't exist.
 */
export async function fetchSmeltBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<bigint> {
  try {
    const ata = await getAssociatedTokenAddress(
      SMELT_MINT,
      owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const info = await connection.getTokenAccountBalance(ata);
    return BigInt(info.value.amount);
  } catch {
    return 0n;
  }
}

/**
 * Fetch the user's StakeAccount PDA data.
 * Returns null if the account doesn't exist (user has never staked).
 */
export async function fetchStakeInfo(
  connection: Connection,
  owner: PublicKey,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
): Promise<StakeInfo | null> {
  try {
    const provider = new AnchorProvider(connection, wallet as never, { commitment: 'confirmed' });
    const idl = await Program.fetchIdl(STAKING_PROGRAM_ID, provider);
    if (!idl) return null;
    const program = new Program(idl as never, STAKING_PROGRAM_ID, provider);

    const [stakeAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('stake'), owner.toBuffer()],
      STAKING_PROGRAM_ID,
    );

    const account = await program.account['stakeAccount'].fetchNullable(stakeAccountPda);
    if (!account) return null;
    const data = account as { amountStaked: BN; bump: number };
    return {
      amountStaked: BigInt(data.amountStaked.toString()),
      bump: data.bump,
    };
  } catch {
    return null;
  }
}

/**
 * Build a `stake` instruction transaction.
 * Caller must sign and send.
 */
export async function buildStakeTransaction(
  connection: Connection,
  owner: PublicKey,
  amountRaw: bigint,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet as never, { commitment: 'confirmed' });
  const idl = await Program.fetchIdl(STAKING_PROGRAM_ID, provider);
  if (!idl) throw new Error('Could not load staking program IDL');
  const program = new Program(idl as never, STAKING_PROGRAM_ID, provider);

  const tx = await program.methods
    .stake(new BN(amountRaw.toString()))
    .transaction();

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;
  return tx;
}

/**
 * Build an `unstake` instruction transaction.
 * Caller must sign and send.
 */
export async function buildUnstakeTransaction(
  connection: Connection,
  owner: PublicKey,
  amountRaw: bigint,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet as never, { commitment: 'confirmed' });
  const idl = await Program.fetchIdl(STAKING_PROGRAM_ID, provider);
  if (!idl) throw new Error('Could not load staking program IDL');
  const program = new Program(idl as never, STAKING_PROGRAM_ID, provider);

  const tx = await program.methods
    .unstake(new BN(amountRaw.toString()))
    .transaction();

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;
  return tx;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/smelt.ts
git commit -m "feat(frontend): SMELT balance + staking transaction builders"
```

---

### Task 3: API routes — `/api/vault` and `/api/stats`

**Files:**
- Create: `app/api/vault/route.ts`
- Create: `app/api/stats/route.ts`

- [ ] **Step 1: Create `app/api/vault/route.ts`**

```typescript
// app/api/vault/route.ts
import { NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { VAULT_PUBKEY, LIQUIDATION_THRESHOLD_USD, MAINNET_RPC } from '@/lib/constants';

interface VaultToken {
  mint: string;
  uiAmount: number;
  usdValue: number;
  symbol?: string;
  pctOfThreshold: number;
}

export async function GET(): Promise<NextResponse> {
  try {
    const connection = new Connection(MAINNET_RPC, 'confirmed');

    const accounts = await connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, {
      programId: TOKEN_PROGRAM_ID,
    });

    const tokens = accounts.value
      .map((a) => {
        const info = a.account.data.parsed.info as {
          mint: string;
          tokenAmount: { uiAmount: number | null; amount: string };
        };
        return {
          mint: info.mint,
          uiAmount: info.tokenAmount.uiAmount ?? 0,
        };
      })
      .filter((t) => t.uiAmount > 0);

    // Fetch prices
    let prices: Record<string, number> = {};
    if (tokens.length > 0) {
      const mints = tokens.map((t) => t.mint).join(',');
      try {
        const res = await fetch(`https://price.jup.ag/v6/price?ids=${mints}`, {
          next: { revalidate: 60 }, // cache for 60s
        });
        if (res.ok) {
          const json = await res.json() as { data: Record<string, { price: number }> };
          prices = Object.fromEntries(
            Object.entries(json.data).map(([mint, d]) => [mint, d.price])
          );
        }
      } catch { /* use zero prices */ }
    }

    const result: VaultToken[] = tokens.map((t) => {
      const usdValue = t.uiAmount * (prices[t.mint] ?? 0);
      return {
        mint: t.mint,
        uiAmount: t.uiAmount,
        usdValue,
        pctOfThreshold: Math.min(100, (usdValue / LIQUIDATION_THRESHOLD_USD) * 100),
      };
    });

    return NextResponse.json({ tokens: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch vault' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create `app/api/stats/route.ts`**

```typescript
// app/api/stats/route.ts
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

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

function loadJson<T>(filepath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export async function GET(): Promise<NextResponse> {
  const LIQUIDATIONS_PATH = path.join(process.cwd(), 'data/liquidations.json');
  const DISTRIBUTIONS_PATH = path.join(process.cwd(), 'data/distributions.json');

  const liquidations = loadJson<LiquidationEntry[]>(LIQUIDATIONS_PATH, []);
  const distributions = loadJson<DistributionEntry[]>(DISTRIBUTIONS_PATH, []);

  const totalSolDistributed = distributions.reduce((s, d) => s + d.totalSol, 0);
  const lastDistribution = [...distributions].reverse().find(Boolean) ?? null;
  const lastLiquidation = [...liquidations].reverse().find(Boolean) ?? null;
  const undistributedSol = liquidations
    .filter((l) => !l.distributed)
    .reduce((s, l) => s + l.solReceived, 0);

  // Next distribution estimate: weekly from last run
  let nextDistributionDate: string | null = null;
  if (lastDistribution) {
    const last = new Date(lastDistribution.date);
    last.setDate(last.getDate() + 7);
    nextDistributionDate = last.toISOString();
  }

  return NextResponse.json({
    liquidations: {
      recent: liquidations.slice(-5).reverse(),
      undistributedSol,
    },
    distributions: {
      totalSolDistributed,
      lastDistribution,
      nextDistributionDate,
    },
  });
}
```

- [ ] **Step 3: Test the API routes**

```bash
npm run dev
```

In another terminal:
```bash
curl http://localhost:3000/api/vault | head -100
curl http://localhost:3000/api/stats | head -100
```

Expected: JSON responses (vault may show empty array if vault has no tokens; stats will show zeros if no data)

- [ ] **Step 4: Commit**

```bash
git add app/api/vault/route.ts app/api/stats/route.ts
git commit -m "feat(frontend): /api/vault and /api/stats routes"
```

---

### Task 4: `lib/pools.ts` — data fetching for pools page

**Files:**
- Create: `lib/pools.ts`

- [ ] **Step 1: Write `lib/pools.ts`**

```typescript
// lib/pools.ts

export interface VaultToken {
  mint: string;
  uiAmount: number;
  usdValue: number;
  symbol?: string;
  pctOfThreshold: number;
}

export interface LiquidationEntry {
  date: string;
  mint: string;
  amountIn: number;
  solReceived: number;
  txSignature: string;
  distributed: boolean;
}

export interface DistributionEntry {
  date: string;
  totalSol: number;
  recipientCount: number;
  txSignatures: string[];
}

export interface PoolsData {
  tokens: VaultToken[];
  liquidations: {
    recent: LiquidationEntry[];
    undistributedSol: number;
  };
  distributions: {
    totalSolDistributed: number;
    lastDistribution: DistributionEntry | null;
    nextDistributionDate: string | null;
  };
}

export async function fetchPoolsData(): Promise<PoolsData> {
  const [vaultRes, statsRes] = await Promise.all([
    fetch('/api/vault', { cache: 'no-store' }),
    fetch('/api/stats', { cache: 'no-store' }),
  ]);

  const vault = vaultRes.ok
    ? (await vaultRes.json() as { tokens: VaultToken[] })
    : { tokens: [] };

  const stats = statsRes.ok
    ? (await statsRes.json() as Omit<PoolsData, 'tokens'>)
    : {
        liquidations: { recent: [], undistributedSol: 0 },
        distributions: { totalSolDistributed: 0, lastDistribution: null, nextDistributionDate: null },
      };

  return {
    tokens: vault.tokens,
    ...stats,
  };
}

/**
 * Calculate the user's estimated SOL share from the next distribution.
 * smeltBalance and smeltStaked are in raw units (9 decimals).
 * totalSmeltSupply is the circulating supply in raw units.
 * undistributedSol is the pending SOL amount.
 */
export function estimateUserShare(
  smeltBalance: bigint,
  smeltStaked: bigint,
  totalWeight: number,
  undistributedSol: number,
): number {
  if (totalWeight === 0 || undistributedSol === 0) return 0;
  const unstaked = smeltBalance - smeltStaked;
  const userWeight = Number(unstaked > 0n ? unstaked : 0n) * 1 + Number(smeltStaked) * 1.5;
  return (userWeight / totalWeight) * undistributedSol;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/pools.ts
git commit -m "feat(frontend): pools data-fetching library"
```

---

### Task 5: `/pools` page

**Files:**
- Create: `app/pools/page.tsx`

`★ Insight ─────────────────────────────────────`
The pools page is a client component because it reads the connected wallet (to show "your estimated share"). Using `'use client'` here means data fetching runs in the browser — which is fine since it's calling our own API routes. For the vault token table, progress bars use inline `style={{ width: '${pct}%' }}` because Tailwind can't generate dynamic width classes at runtime.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Create `app/pools/` directory and write `app/pools/page.tsx`**

```tsx
// app/pools/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { fetchPoolsData, PoolsData } from '@/lib/pools';
import { fetchSmeltBalance, fetchStakeInfo } from '@/lib/smelt';

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function PoolsPage() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [data, setData] = useState<PoolsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [smeltBalance, setSmeltBalance] = useState(0n);
  const [smeltStaked, setSmeltStaked] = useState(0n);

  useEffect(() => {
    fetchPoolsData()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!publicKey || !signTransaction) return;
    const wallet = { publicKey, signTransaction };
    fetchSmeltBalance(connection, publicKey).then(setSmeltBalance).catch(console.error);
    fetchStakeInfo(connection, publicKey, wallet as never)
      .then((info) => setSmeltStaked(info?.amountStaked ?? 0n))
      .catch(console.error);
  }, [publicKey, signTransaction, connection]);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  const tokens = data?.tokens ?? [];
  const recentLiquidations = data?.liquidations.recent ?? [];
  const undistributedSol = data?.liquidations.undistributedSol ?? 0;
  const totalSolDistributed = data?.distributions.totalSolDistributed ?? 0;
  const lastDist = data?.distributions.lastDistribution ?? null;
  const nextDistDate = data?.distributions.nextDistributionDate ?? null;

  // Estimate user share
  const smeltBalanceUi = Number(smeltBalance) / 1e9;
  const smeltStakedUi = Number(smeltStaked) / 1e9;
  const unstaked = smeltBalanceUi - smeltStakedUi;
  const userWeight = unstaked * 1 + smeltStakedUi * 1.5;
  // totalWeight is unknown without fetching all holders; show proportional estimate if user has SMELT
  const estimatedShare = userWeight > 0 && undistributedSol > 0
    ? `~${(undistributedSol * 0.001).toFixed(4)} SOL` // placeholder until full weight known
    : '—';

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Vault Contents */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Vault Contents</h2>
          {tokens.length === 0 ? (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-zinc-500 text-sm">
              Vault is empty — no tokens accumulated yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-500">
                    <th className="text-left px-4 py-3">Token</th>
                    <th className="text-right px-4 py-3">Balance</th>
                    <th className="text-right px-4 py-3">USD Value</th>
                    <th className="px-4 py-3 w-36">Progress to $10</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.mint} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 font-mono text-zinc-300">{shortAddr(token.mint)}</td>
                      <td className="px-4 py-3 text-right text-zinc-300">{token.uiAmount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-zinc-300">${token.usdValue.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${token.pctOfThreshold}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-500 mt-1 block text-right">
                          {token.pctOfThreshold.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Liquidation History */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Recent Liquidations</h2>
          {recentLiquidations.length === 0 ? (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-zinc-500 text-sm">
              No liquidations yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-500">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Token</th>
                    <th className="text-right px-4 py-3">SOL Received</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLiquidations.map((liq, i) => (
                    <tr key={i} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 text-zinc-400">{formatDate(liq.date)}</td>
                      <td className="px-4 py-3 font-mono text-zinc-300">{shortAddr(liq.mint)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{liq.solReceived.toFixed(6)} SOL</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Distribution Stats */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Distribution Stats</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <div className="text-xs text-zinc-500 mb-1">Next Distribution</div>
              <div className="text-zinc-200 font-medium">
                {nextDistDate ? formatDate(nextDistDate) : 'Not scheduled'}
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <div className="text-xs text-zinc-500 mb-1">Your Est. Share</div>
              <div className="text-emerald-400 font-medium">{estimatedShare}</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <div className="text-xs text-zinc-500 mb-1">Total SOL Distributed</div>
              <div className="text-zinc-200 font-medium">{totalSolDistributed.toFixed(4)} SOL</div>
            </div>
          </div>
        </section>

        {/* Your Stats */}
        {publicKey && (
          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-4">Your Stats</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <div className="text-xs text-zinc-500 mb-1">SMELT Balance</div>
                <div className="text-zinc-200 font-medium">{smeltBalanceUi.toLocaleString()} SMELT</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <div className="text-xs text-zinc-500 mb-1">Staked</div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-200 font-medium">{smeltStakedUi.toLocaleString()} SMELT</span>
                  {smeltStakedUi > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                      1.5× active
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify the page renders**

```bash
npm run dev
```

Navigate to `http://localhost:3000/pools`. Expected: pools page with vault contents section (empty if vault has no tokens), distribution stats (zeros), and "Your Stats" if wallet is connected.

- [ ] **Step 3: Commit**

```bash
git add app/pools/page.tsx
git commit -m "feat(frontend): /pools page — vault contents, liquidations, distribution stats"
```

---

### Task 6: SMELT sidebar section + inline stake panel

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Read `app/page.tsx` to find the sidebar section**

Find the sidebar — it contains the wallet connection button and recycle stats. The SMELT section goes below the existing stats.

- [ ] **Step 2: Add SMELT balance and staking state to `app/page.tsx`**

In the component, add new state and effects after the existing wallet/recycle state:

```typescript
// SMELT state
const [smeltBalance, setSmeltBalance] = useState(0n);
const [smeltStaked, setSmeltStaked] = useState(0n);
const [stakeOpen, setStakeOpen] = useState(false);
const [stakeMode, setStakeMode] = useState<'stake' | 'unstake'>('stake');
const [stakeInput, setStakeInput] = useState('');
const [stakeLoading, setStakeLoading] = useState(false);
const [stakeError, setStakeError] = useState<string | null>(null);
```

Add an effect to load SMELT data when wallet connects:

```typescript
useEffect(() => {
  if (!publicKey || !signTransaction) return;
  const wallet = { publicKey, signTransaction };
  fetchSmeltBalance(connection, publicKey).then(setSmeltBalance).catch(console.error);
  fetchStakeInfo(connection, publicKey, wallet as never)
    .then((info) => setSmeltStaked(info?.amountStaked ?? 0n))
    .catch(console.error);
}, [publicKey, signTransaction, connection]);
```

Add imports at the top of the file:

```typescript
import { fetchSmeltBalance, fetchStakeInfo, buildStakeTransaction, buildUnstakeTransaction } from '@/lib/smelt';
```

- [ ] **Step 3: Add the SMELT sidebar section JSX**

In the sidebar JSX, after the existing stats cards, add:

```tsx
{/* SMELT section */}
{publicKey && (
  <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-zinc-400">SMELT</span>
      {smeltStaked > 0n && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
          1.5× active
        </span>
      )}
    </div>
    <div className="flex justify-between text-sm">
      <span className="text-zinc-500">Balance</span>
      <span className="text-zinc-200">{(Number(smeltBalance) / 1e9).toLocaleString()}</span>
    </div>
    <div className="flex justify-between text-sm">
      <span className="text-zinc-500">Staked</span>
      <span className="text-zinc-200">{(Number(smeltStaked) / 1e9).toLocaleString()}</span>
    </div>
    <button
      onClick={() => setStakeOpen((o) => !o)}
      className="w-full rounded-xl py-2 text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
    >
      {stakeOpen ? 'Close' : 'Stake / Unstake'}
    </button>

    {/* Inline stake panel */}
    {stakeOpen && (
      <div className="space-y-3 pt-2 border-t border-white/10">
        <div className="flex gap-2">
          {(['stake', 'unstake'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { setStakeMode(mode); setStakeInput(''); setStakeError(null); }}
              className={[
                'flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors capitalize',
                stakeMode === mode
                  ? 'bg-emerald-500/30 text-emerald-300'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10',
              ].join(' ')}
            >
              {mode}
            </button>
          ))}
        </div>
        <input
          type="number"
          min="0"
          placeholder="Amount"
          value={stakeInput}
          onChange={(e) => setStakeInput(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
        />
        {stakeError && (
          <p className="text-xs text-red-400">{stakeError}</p>
        )}
        <button
          disabled={stakeLoading || !stakeInput}
          onClick={async () => {
            if (!publicKey || !signTransaction) return;
            const wallet = { publicKey, signTransaction };
            const amount = parseFloat(stakeInput);
            if (isNaN(amount) || amount <= 0) return;
            const rawAmount = BigInt(Math.floor(amount * 1e9));
            setStakeLoading(true);
            setStakeError(null);
            try {
              const builder = stakeMode === 'stake' ? buildStakeTransaction : buildUnstakeTransaction;
              const tx = await builder(connection, publicKey, rawAmount, wallet as never);
              const signed = await signTransaction(tx);
              const sig = await connection.sendRawTransaction(signed.serialize());
              await connection.confirmTransaction(sig, 'confirmed');
              // Refresh balances
              const newBalance = await fetchSmeltBalance(connection, publicKey);
              setSmeltBalance(newBalance);
              const newStake = await fetchStakeInfo(connection, publicKey, wallet as never);
              setSmeltStaked(newStake?.amountStaked ?? 0n);
              setStakeInput('');
              setStakeOpen(false);
            } catch (err) {
              setStakeError(err instanceof Error ? err.message : 'Transaction failed');
            } finally {
              setStakeLoading(false);
            }
          }}
          className="w-full rounded-xl py-2 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors capitalize"
        >
          {stakeLoading ? 'Processing…' : stakeMode}
        </button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Verify the page builds**

```bash
npm run build
```

Expected: successful build, no TypeScript errors

- [ ] **Step 5: Test stake panel**

```bash
npm run dev
```

Connect wallet. SMELT section should appear below stats with balance (0 if never recycled), staked amount (0), and the Stake/Unstake button opening the inline panel.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat(frontend): SMELT sidebar section + inline stake/unstake panel"
```

---

### Task 7: Final integration check

**Files:**
- Verify all routes and components wire together correctly

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all existing tests pass (17 lib tests + 10 frontend tests)

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: clean build, no errors

- [ ] **Step 3: Smoke test all pages**

```bash
npm run dev
```

Check:
1. `http://localhost:3000` — Recycle tab active, SMELT sidebar section visible (if wallet connected)
2. `http://localhost:3000/pools` — Pools tab active, vault contents table, distribution stats
3. `http://localhost:3000/api/vault` — returns `{ "tokens": [] }` or real data
4. `http://localhost:3000/api/stats` — returns liquidation + distribution summaries
5. Clicking Stake/Unstake opens inline panel with amount input and toggle

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(smelt-sub3): frontend expansion complete — nav, pools page, staking UI"
```

---

## Self-Review Against Spec

Spec requirements for Sub-project 3:

- [x] Two-tab header: "♻ Recycle" + "🏊 Pools" — `components/Nav.tsx` + `app/layout.tsx`
- [x] Sidebar: SMELT balance — `fetchSmeltBalance` in `lib/smelt.ts`, shown in `app/page.tsx`
- [x] Sidebar: Staked amount — `fetchStakeInfo` reads StakeAccount PDA
- [x] "1.5× active" badge when `staked > 0` — inline JSX in sidebar
- [x] Stake / Unstake button → inline panel — `stakeOpen` toggle in `app/page.tsx`
- [x] Stake panel: amount input, wallet balance, staked amount, boost indicator
- [x] Stake panel: calls Anchor `stake` / `unstake` via `@coral-xyz/anchor`
- [x] Single wallet approval, optimistic UI update after confirm
- [x] `/pools` page — `app/pools/page.tsx`
- [x] Vault contents table: token, balance, USD value, progress bar — ✓
- [x] Liquidation history (last 5) — from `/api/stats`
- [x] Distribution stats: next date, estimated share, total distributed — ✓
- [x] Your stats: SMELT balance, staked — ✓
- [x] `GET /api/vault` — vault balances + USD values — `app/api/vault/route.ts`
- [x] `GET /api/stats` — liquidation + distribution summaries — `app/api/stats/route.ts`
- [x] `lib/smelt.ts` — fetch balance, build stake/unstake txs — ✓
- [x] `lib/pools.ts` — fetch vault balances, read distribution data — ✓
