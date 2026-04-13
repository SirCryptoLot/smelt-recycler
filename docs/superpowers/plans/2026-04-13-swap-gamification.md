# Swap, Gamification & Mobile Wallets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Dust-to-SMELT atomic swap, user dashboard, community leaderboard, referral flywheel, ecosystem health stats, and mobile wallet deep-link support.

**Architecture:** Three new `lib/` helpers manage `data/leaderboard.json`, `data/referrals.json`, and `data/ecosystem.json`. Four new API routes serve these. Three new pages (dashboard, community, swap) consume the APIs. Existing `/api/recycle` is extended to feed the new data layer. Mobile wallet fix is a single `providers.tsx` change.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, `@solana/wallet-adapter-wallets` v0.19 (already installed), Jupiter V6 Quote + Swap API (`quote-api.jup.ag/v6`), Jupiter Terminal embed (`terminal.jup.ag/main-v3.js`).

---

## File Map

**Create:**
- `lib/leaderboard.ts` — read/write `data/leaderboard.json`
- `lib/referrals.ts` — read/write `data/referrals.json`
- `lib/ecosystem.ts` — read/write `data/ecosystem.json`
- `lib/jupiter-swap.ts` — Jupiter quote fetch + swap transaction builder
- `data/leaderboard.json` — initial empty structure
- `data/referrals.json` — initial empty structure
- `data/ecosystem.json` — initial empty structure
- `app/api/dashboard/route.ts` — GET `?wallet=` → all stats for one wallet
- `app/api/leaderboard/route.ts` — GET → top 20 weekly + all-time
- `app/api/ecosystem/route.ts` — GET → platform totals
- `components/ReferralDetector.tsx` — client component: reads `?ref=` → localStorage
- `app/dashboard/page.tsx` — Portfolio + Activity + Referrals + Rewards
- `app/community/page.tsx` — Ecosystem health + Leaderboard + Activity feed
- `app/swap/page.tsx` — Dust→SMELT mode + Jupiter Terminal buy mode

**Modify:**
- `app/providers.tsx` — add SolflareWalletAdapter + Adapter[] type for mobile support
- `app/api/recycle/route.ts` — accept `referredBy`, update leaderboard + ecosystem
- `app/layout.tsx` — include `<ReferralDetector />`
- `components/AppShell.tsx` — add Swap, Community, Dashboard nav items

---

## Task 1: Mobile Wallet Fix

**Files:**
- Modify: `app/providers.tsx`

- [ ] **Step 1: Update providers.tsx**

Replace the entire file:

```tsx
'use client';

import type { ComponentType } from 'react';
import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import type { Adapter } from '@solana/wallet-adapter-base';
import '@solana/wallet-adapter-react-ui/styles.css';

const MAINNET_RPC = 'https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15';

const CP = ConnectionProvider as ComponentType<{ endpoint: string; children: React.ReactNode }>;
const WP = WalletProvider as ComponentType<{ wallets: Adapter[]; autoConnect: boolean; children: React.ReactNode }>;
const WMP = WalletModalProvider as ComponentType<{ children: React.ReactNode }>;

export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);
  return (
    <CP endpoint={MAINNET_RPC}>
      <WP wallets={wallets} autoConnect>
        <WMP>{children}</WMP>
      </WP>
    </CP>
  );
}
```

- [ ] **Step 2: Verify TypeScript passes**

```bash
cd /c/recycle && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/recycle && git add app/providers.tsx && git commit -m "fix: add SolflareWalletAdapter + Adapter[] type for mobile wallet support"
```

---

## Task 2: Seed Data Files

**Files:**
- Create: `data/leaderboard.json`
- Create: `data/referrals.json`
- Create: `data/ecosystem.json`

- [ ] **Step 1: Create data/leaderboard.json**

```json
{
  "weekly": {
    "since": "2026-04-13T00:00:00.000Z",
    "entries": {}
  },
  "allTime": {
    "entries": {}
  }
}
```

- [ ] **Step 2: Create data/referrals.json**

```json
{
  "relationships": {},
  "pendingBonuses": {}
}
```

- [ ] **Step 3: Create data/ecosystem.json**

```json
{
  "totalWallets": 0,
  "totalAccountsClosed": 0,
  "totalSolReclaimed": 0,
  "totalSmeltMinted": 0,
  "lastUpdated": "2026-04-13T00:00:00.000Z"
}
```

- [ ] **Step 4: Commit**

```bash
cd /c/recycle && git add data/leaderboard.json data/referrals.json data/ecosystem.json && git commit -m "chore: seed leaderboard, referrals, ecosystem data files"
```

---

## Task 3: Data Layer Helpers

**Files:**
- Create: `lib/leaderboard.ts`
- Create: `lib/referrals.ts`
- Create: `lib/ecosystem.ts`

- [ ] **Step 1: Create lib/leaderboard.ts**

```typescript
// lib/leaderboard.ts
import * as fs from 'fs';
import * as path from 'path';

const PATH = path.join(process.cwd(), 'data/leaderboard.json');

export interface LeaderboardEntry {
  accounts: number;
  solReclaimed: number;
  smeltEarned: number;
}

export interface LeaderboardData {
  weekly: { since: string; entries: Record<string, LeaderboardEntry> };
  allTime: { entries: Record<string, LeaderboardEntry> };
}

function load(): LeaderboardData {
  try {
    if (!fs.existsSync(PATH)) return {
      weekly: { since: new Date().toISOString(), entries: {} },
      allTime: { entries: {} },
    };
    return JSON.parse(fs.readFileSync(PATH, 'utf-8')) as LeaderboardData;
  } catch {
    return { weekly: { since: new Date().toISOString(), entries: {} }, allTime: { entries: {} } };
  }
}

function save(data: LeaderboardData): void {
  try { fs.writeFileSync(PATH, JSON.stringify(data, null, 2)); } catch { /* non-blocking */ }
}

export function recordRecycle(wallet: string, accounts: number, solReclaimed: number, smeltEarned: number): void {
  const data = load();

  // Weekly
  const w = data.weekly.entries[wallet] ?? { accounts: 0, solReclaimed: 0, smeltEarned: 0 };
  data.weekly.entries[wallet] = {
    accounts: w.accounts + accounts,
    solReclaimed: w.solReclaimed + solReclaimed,
    smeltEarned: w.smeltEarned + smeltEarned,
  };

  // All-time
  const a = data.allTime.entries[wallet] ?? { accounts: 0, solReclaimed: 0, smeltEarned: 0 };
  data.allTime.entries[wallet] = {
    accounts: a.accounts + accounts,
    solReclaimed: a.solReclaimed + solReclaimed,
    smeltEarned: a.smeltEarned + smeltEarned,
  };

  save(data);
}

export function getLeaderboard(): LeaderboardData {
  return load();
}

export function getWalletStats(wallet: string): { weekly: LeaderboardEntry; allTime: LeaderboardEntry } {
  const data = load();
  const empty = { accounts: 0, solReclaimed: 0, smeltEarned: 0 };
  return {
    weekly: data.weekly.entries[wallet] ?? empty,
    allTime: data.allTime.entries[wallet] ?? empty,
  };
}

export function getWeeklyRank(wallet: string): number {
  const data = load();
  const sorted = Object.entries(data.weekly.entries)
    .sort(([, a], [, b]) => b.accounts - a.accounts);
  const idx = sorted.findIndex(([w]) => w === wallet);
  return idx === -1 ? 0 : idx + 1;
}
```

- [ ] **Step 2: Create lib/referrals.ts**

```typescript
// lib/referrals.ts
import * as fs from 'fs';
import * as path from 'path';

const PATH = path.join(process.cwd(), 'data/referrals.json');

export interface ReferralEvent {
  referee: string;
  accountsClosed: number;
  solReclaimed: number;
  bonusEarned: number;
  date: string;
}

export interface ReferralsData {
  relationships: Record<string, ReferralEvent[]>;
  pendingBonuses: Record<string, number>;
}

function load(): ReferralsData {
  try {
    if (!fs.existsSync(PATH)) return { relationships: {}, pendingBonuses: {} };
    return JSON.parse(fs.readFileSync(PATH, 'utf-8')) as ReferralsData;
  } catch {
    return { relationships: {}, pendingBonuses: {} };
  }
}

function save(data: ReferralsData): void {
  try { fs.writeFileSync(PATH, JSON.stringify(data, null, 2)); } catch { /* non-blocking */ }
}

// Called when Bob recycles via Alice's referral link.
// bonus = 1% of the platform fee earned (feeEarned = 0.002 * 0.05 * accountsClosed)
export function recordReferral(referrer: string, referee: string, accountsClosed: number, solReclaimed: number): void {
  const feeEarned = accountsClosed * 0.002 * 0.05;
  const bonusEarned = feeEarned * 0.1; // 10% of platform fee goes to referrer
  const data = load();

  if (!data.relationships[referrer]) data.relationships[referrer] = [];
  data.relationships[referrer].push({
    referee,
    accountsClosed,
    solReclaimed,
    bonusEarned,
    date: new Date().toISOString(),
  });

  data.pendingBonuses[referrer] = (data.pendingBonuses[referrer] ?? 0) + bonusEarned;
  save(data);
}

export function getReferralStats(wallet: string): {
  referrals: ReferralEvent[];
  pendingBonus: number;
  totalEarned: number;
} {
  const data = load();
  const referrals = data.relationships[wallet] ?? [];
  const pendingBonus = data.pendingBonuses[wallet] ?? 0;
  const totalEarned = referrals.reduce((s, r) => s + r.bonusEarned, 0);
  return { referrals, pendingBonus, totalEarned };
}
```

- [ ] **Step 3: Create lib/ecosystem.ts**

```typescript
// lib/ecosystem.ts
import * as fs from 'fs';
import * as path from 'path';

const PATH = path.join(process.cwd(), 'data/ecosystem.json');

export interface EcosystemData {
  totalWallets: number;
  totalAccountsClosed: number;
  totalSolReclaimed: number;
  totalSmeltMinted: number;
  lastUpdated: string;
}

function load(): EcosystemData {
  try {
    if (!fs.existsSync(PATH)) return {
      totalWallets: 0, totalAccountsClosed: 0,
      totalSolReclaimed: 0, totalSmeltMinted: 0,
      lastUpdated: new Date().toISOString(),
    };
    return JSON.parse(fs.readFileSync(PATH, 'utf-8')) as EcosystemData;
  } catch {
    return { totalWallets: 0, totalAccountsClosed: 0, totalSolReclaimed: 0, totalSmeltMinted: 0, lastUpdated: new Date().toISOString() };
  }
}

function save(data: EcosystemData): void {
  try { fs.writeFileSync(PATH, JSON.stringify(data, null, 2)); } catch { /* non-blocking */ }
}

export function recordRecycle(wallet: string, accountsClosed: number, solReclaimed: number, smeltMinted: number): void {
  const data = load();

  // Count unique wallets: check leaderboard allTime entries
  // We increment totalWallets only on first recycle from this wallet.
  // We detect "first time" by checking if solReclaimed was 0 before — but we don't have
  // per-wallet history here. Instead, pass isNewWallet flag from the caller.
  data.totalAccountsClosed += accountsClosed;
  data.totalSolReclaimed += solReclaimed;
  data.totalSmeltMinted += smeltMinted;
  data.lastUpdated = new Date().toISOString();
  save(data);
}

export function incrementWalletCount(): void {
  const data = load();
  data.totalWallets += 1;
  data.lastUpdated = new Date().toISOString();
  save(data);
}

export function getEcosystem(): EcosystemData {
  return load();
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /c/recycle && git add lib/leaderboard.ts lib/referrals.ts lib/ecosystem.ts && git commit -m "feat: add leaderboard, referrals, ecosystem data helpers"
```

---

## Task 4: Extend /api/recycle

**Files:**
- Modify: `app/api/recycle/route.ts`

- [ ] **Step 1: Replace app/api/recycle/route.ts**

```typescript
// app/api/recycle/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { mintSmeltReward } from '../../../scripts/mint-smelt';
import { currentSmeltPerAccount } from '../../../lib/constants';
import { recordRecycle as recordLeaderboard, getWalletStats } from '../../../lib/leaderboard';
import { recordReferral } from '../../../lib/referrals';
import { recordRecycle as recordEcosystem, incrementWalletCount } from '../../../lib/ecosystem';

const FEES_PATH = path.join(process.cwd(), 'data/fees.json');
const SOL_FEE_PER_ACCOUNT = 0.002 * 0.05;
const SOL_RECLAIMED_PER_ACCOUNT = 0.002 * 0.95;

interface FeeEntry {
  date: string;
  wallet: string;
  accountsClosed: number;
  solFees: number;
  distributed: boolean;
}

function appendFee(entry: FeeEntry): void {
  try {
    const existing: FeeEntry[] = fs.existsSync(FEES_PATH)
      ? JSON.parse(fs.readFileSync(FEES_PATH, 'utf-8')) as FeeEntry[]
      : [];
    existing.push(entry);
    fs.writeFileSync(FEES_PATH, JSON.stringify(existing, null, 2));
  } catch { /* non-blocking */ }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      wallet: string;
      accountsClosed: number;
      referredBy?: string;
    };
    const { wallet, accountsClosed, referredBy } = body;

    if (!wallet || typeof accountsClosed !== 'number' || accountsClosed <= 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const recipient = new PublicKey(wallet);
    const txSig = await mintSmeltReward(recipient, accountsClosed);
    const smeltMinted = currentSmeltPerAccount() * accountsClosed;
    const solReclaimed = SOL_RECLAIMED_PER_ACCOUNT * accountsClosed;

    // Fee log
    appendFee({
      date: new Date().toISOString(),
      wallet,
      accountsClosed,
      solFees: SOL_FEE_PER_ACCOUNT * accountsClosed,
      distributed: false,
    });

    // Check if this is a new wallet (no prior all-time stats)
    const priorStats = getWalletStats(wallet);
    const isNewWallet = priorStats.allTime.accounts === 0;

    // Leaderboard + ecosystem
    recordLeaderboard(wallet, accountsClosed, solReclaimed, smeltMinted);
    recordEcosystem(wallet, accountsClosed, solReclaimed, smeltMinted);
    if (isNewWallet) incrementWalletCount();

    // Referral bonus
    if (referredBy && referredBy !== wallet) {
      try {
        new PublicKey(referredBy); // validate it's a real pubkey
        recordReferral(referredBy, wallet, accountsClosed, solReclaimed);
      } catch { /* invalid pubkey — silently ignore */ }
    }

    return NextResponse.json({ success: true, txSignature: txSig, smeltMinted });
  } catch (err) {
    console.error('Mint failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Mint failed' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/recycle && git add app/api/recycle/route.ts && git commit -m "feat: extend /api/recycle with referral tracking, leaderboard, ecosystem updates"
```

---

## Task 5: New API Routes

**Files:**
- Create: `app/api/ecosystem/route.ts`
- Create: `app/api/leaderboard/route.ts`
- Create: `app/api/dashboard/route.ts`

- [ ] **Step 1: Create app/api/ecosystem/route.ts**

```typescript
// app/api/ecosystem/route.ts
import { NextResponse } from 'next/server';
import { getEcosystem } from '../../../lib/ecosystem';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getEcosystem());
}
```

- [ ] **Step 2: Create app/api/leaderboard/route.ts**

```typescript
// app/api/leaderboard/route.ts
import { NextResponse } from 'next/server';
import { getLeaderboard } from '../../../lib/leaderboard';

function top20(entries: Record<string, { accounts: number; solReclaimed: number; smeltEarned: number }>) {
  return Object.entries(entries)
    .sort(([, a], [, b]) => b.accounts - a.accounts)
    .slice(0, 20)
    .map(([wallet, stats]) => ({ wallet, ...stats }));
}

export async function GET(): Promise<NextResponse> {
  const data = getLeaderboard();
  return NextResponse.json({
    weekly: {
      since: data.weekly.since,
      entries: top20(data.weekly.entries),
    },
    allTime: {
      entries: top20(data.allTime.entries),
    },
  });
}
```

- [ ] **Step 3: Create app/api/dashboard/route.ts**

```typescript
// app/api/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { getWalletStats, getWeeklyRank } from '../../../lib/leaderboard';
import { getReferralStats } from '../../../lib/referrals';

interface DistributionEntry {
  date: string;
  totalSol: number;
  recipientCount: number;
  txSignatures: string[];
}

const DISTRIBUTIONS_PATH = path.join(process.cwd(), 'data/distributions.json');

function loadDistributions(): DistributionEntry[] {
  try {
    if (!fs.existsSync(DISTRIBUTIONS_PATH)) return [];
    return JSON.parse(fs.readFileSync(DISTRIBUTIONS_PATH, 'utf-8')) as DistributionEntry[];
  } catch { return []; }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet param required' }, { status: 400 });

  const stats = getWalletStats(wallet);
  const rank = getWeeklyRank(wallet);
  const referral = getReferralStats(wallet);
  const distributions = loadDistributions();

  const lastDist = [...distributions].reverse().find(Boolean) ?? null;
  let nextDistributionDate: string | null = null;
  if (lastDist) {
    const d = new Date(lastDist.date);
    d.setDate(d.getDate() + 7);
    nextDistributionDate = d.toISOString();
  }

  return NextResponse.json({
    activity: {
      weeklyAccounts: stats.weekly.accounts,
      weeklyRank: rank,
      allTimeAccounts: stats.allTime.accounts,
      allTimeSolReclaimed: stats.allTime.solReclaimed,
      allTimeSmeltEarned: stats.allTime.smeltEarned,
    },
    referral: {
      link: '', // built client-side from window.location.origin
      referrals: referral.referrals.slice(-10).reverse(),
      pendingBonus: referral.pendingBonus,
      totalEarned: referral.totalEarned,
      count: referral.referrals.length,
    },
    distributions: {
      recent: distributions.slice(-5).reverse(),
      nextDistributionDate,
    },
  });
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /c/recycle && git add app/api/ecosystem/route.ts app/api/leaderboard/route.ts app/api/dashboard/route.ts && git commit -m "feat: add /api/ecosystem, /api/leaderboard, /api/dashboard routes"
```

---

## Task 6: Referral Detection + Nav Update

**Files:**
- Create: `components/ReferralDetector.tsx`
- Modify: `app/layout.tsx`
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Create components/ReferralDetector.tsx**

```tsx
// components/ReferralDetector.tsx
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function ReferralDetector() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref) return;
    // Only store the first referrer — never overwrite
    if (!localStorage.getItem('referredBy')) {
      localStorage.setItem('referredBy', ref);
    }
  }, [searchParams]);

  return null;
}
```

- [ ] **Step 2: Update app/layout.tsx**

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AppShell } from '@/components/AppShell';
import { SmeltProvider } from '@/lib/smelt-context';
import { Suspense } from 'react';
import { ReferralDetector } from '@/components/ReferralDetector';

export const metadata: Metadata = {
  title: '♻ Recycler',
  description: 'Reclaim your SOL from dust accounts',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SmeltProvider>
            <Suspense fallback={null}>
              <ReferralDetector />
            </Suspense>
            <AppShell>{children}</AppShell>
          </SmeltProvider>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Update NAV_ITEMS in components/AppShell.tsx**

Find this block (lines 12-16) and replace:

```typescript
const NAV_ITEMS = [
  { href: '/', label: 'Recycle', icon: '♻' },
  { href: '/pools', label: 'Pools', icon: '🏊' },
  { href: '/how-it-works', label: 'How it works', icon: '📖' },
];
```

Replace with:

```typescript
const NAV_ITEMS = [
  { href: '/', label: 'Recycle', icon: '♻' },
  { href: '/swap', label: 'Swap', icon: '⇄' },
  { href: '/community', label: 'Community', icon: '🌍' },
  { href: '/pools', label: 'Pools', icon: '🏊' },
  { href: '/how-it-works', label: 'How it works', icon: '📖' },
];
```

- [ ] **Step 4: Add conditional Dashboard link in AppShell.tsx**

In the `<nav>` block (after the `{NAV_ITEMS.map(...)}` block, before `</nav>`), add:

```tsx
{connected && publicKey && (
  <Link
    href="/dashboard"
    className={[
      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors mt-2 border-t border-white/5 pt-3',
      pathname === '/dashboard'
        ? 'bg-emerald-500/15 text-emerald-400'
        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
    ].join(' ')}
  >
    <span>👤</span>
    <span>Dashboard</span>
  </Link>
)}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /c/recycle && git add components/ReferralDetector.tsx app/layout.tsx components/AppShell.tsx && git commit -m "feat: referral detection (localStorage), nav update with Swap/Community/Dashboard"
```

---

## Task 7: Jupiter Swap Helper

**Files:**
- Create: `lib/jupiter-swap.ts`

- [ ] **Step 1: Create lib/jupiter-swap.ts**

```typescript
// lib/jupiter-swap.ts
import { VersionedTransaction } from '@solana/web3.js';
import { connection, MAINNET_RPC } from './solana';
import { SMELT_MINT } from './constants';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';
const SWAP_URL = 'https://quote-api.jup.ag/v6/swap';

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: unknown[];
}

// Get a quote to swap SOL → SMELT.
// lamports: amount of SOL in lamports (1 SOL = 1_000_000_000 lamports)
export async function getSmeltQuote(lamports: number): Promise<JupiterQuote | null> {
  try {
    const url = `${QUOTE_URL}?inputMint=${SOL_MINT}&outputMint=${SMELT_MINT.toBase58()}&amount=${lamports}&slippageBps=100`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json() as JupiterQuote;
  } catch {
    return null;
  }
}

// Get current SMELT market price in SOL.
// Returns price per SMELT in SOL, or null if unavailable.
export async function getSmeltPrice(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${SMELT_MINT.toBase58()}`);
    if (!res.ok) return null;
    const json = await res.json() as { data: Record<string, { price: string } | null> };
    const entry = json.data[SMELT_MINT.toBase58()];
    if (!entry) return null;
    return parseFloat(entry.price) || null;
  } catch {
    return null;
  }
}

// Build a swap transaction from a quote. Returns base64-encoded transaction string.
export async function buildSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
): Promise<string> {
  const res = await fetch(SWAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap build failed: ${res.status}`);
  const { swapTransaction } = await res.json() as { swapTransaction: string };
  return swapTransaction;
}

// Sign and send a base64 swap transaction. Returns txSignature.
export async function executeSwap(
  swapTransaction: string,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
): Promise<string> {
  const buf = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(buf);
  const signed = await signTransaction(tx);
  const txId = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: txId, ...latestBlockhash }, 'confirmed');
  return txId;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/recycle && git add lib/jupiter-swap.ts && git commit -m "feat: Jupiter V6 quote + swap helpers for SOL→SMELT"
```

---

## Task 8: Swap Page

**Files:**
- Create: `app/swap/page.tsx`

- [ ] **Step 1: Create app/swap/page.tsx**

```tsx
// app/swap/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { getTrashAccounts, solToReclaim, TrashAccount, connection } from '@/lib/solana';
import { recycleAccounts } from '@/lib/recycle';
import { getSmeltQuote, getSmeltPrice, buildSwapTransaction, executeSwap, JupiterQuote } from '@/lib/jupiter-swap';
import { useSmelt } from '@/lib/smelt-context';
import { currentSmeltPerAccount } from '@/lib/constants';
import { SMELT_MINT } from '@/lib/constants';

type Mode = 'dust' | 'buy';
type DustStatus = 'idle' | 'scanning' | 'ready' | 'step1' | 'step2' | 'done' | 'error';

declare global {
  interface Window {
    Jupiter?: {
      init: (config: Record<string, unknown>) => void;
    };
  }
}

export default function SwapPage() {
  const { publicKey, connected, signAllTransactions, signTransaction } = useWallet();
  const { refreshSmelt } = useSmelt();

  const [mode, setMode] = useState<Mode>('dust');
  const [dustStatus, setDustStatus] = useState<DustStatus>('idle');
  const [accounts, setAccounts] = useState<TrashAccount[]>([]);
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [smeltPrice, setSmeltPrice] = useState<number | null>(null);
  const [nav, setNav] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [txSig, setTxSig] = useState('');
  const jupiterRef = useRef<HTMLDivElement>(null);
  const [jupiterLoaded, setJupiterLoaded] = useState(false);

  // Fetch SMELT market price + NAV for Buy mode
  useEffect(() => {
    getSmeltPrice().then(setSmeltPrice).catch(() => {});
    fetch('/api/stats', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        const pending = (d.liquidations?.undistributedSol ?? 0) + (d.fees?.undistributedSol ?? 0);
        // NAV requires supply — fetch from smelt context or estimate
        // For now show pending SOL as a proxy indicator
        setNav(pending);
      })
      .catch(() => {});
  }, []);

  // Load Jupiter Terminal for Buy mode
  useEffect(() => {
    if (mode !== 'buy' || jupiterLoaded) return;
    const script = document.createElement('script');
    script.src = 'https://terminal.jup.ag/main-v3.js';
    script.setAttribute('data-preload', '');
    script.onload = () => {
      setJupiterLoaded(true);
      if (window.Jupiter && jupiterRef.current) {
        window.Jupiter.init({
          displayMode: 'integrated',
          integratedTargetId: 'jupiter-terminal',
          endpoint: 'https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15',
          defaultExplorer: 'Solscan',
          formProps: {
            fixedOutputMint: true,
            initialOutputMint: SMELT_MINT.toBase58(),
          },
        });
      }
    };
    document.head.appendChild(script);
  }, [mode, jupiterLoaded]);

  // Scan dust accounts
  const scan = useCallback(async () => {
    if (!publicKey) return;
    setDustStatus('scanning');
    setError('');
    try {
      const result = await getTrashAccounts(publicKey);
      setAccounts(result);
      if (result.length > 0) {
        const lamports = Math.floor(solToReclaim(result.length) * 1e9);
        const q = await getSmeltQuote(lamports);
        setQuote(q);
      }
      setDustStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setDustStatus('error');
    }
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey && mode === 'dust') scan();
  }, [connected, publicKey, mode, scan]);

  // Refresh quote every 10s
  useEffect(() => {
    if (dustStatus !== 'ready' || accounts.length === 0) return;
    const id = setInterval(async () => {
      const lamports = Math.floor(solToReclaim(accounts.length) * 1e9);
      const q = await getSmeltQuote(lamports);
      if (q) setQuote(q);
    }, 10_000);
    return () => clearInterval(id);
  }, [dustStatus, accounts]);

  const convertToSmelt = useCallback(async () => {
    if (!publicKey || !signAllTransactions || !signTransaction || accounts.length === 0) return;

    setDustStatus('step1');
    setError('');
    try {
      // Step 1: recycle accounts → get SOL
      const result = await recycleAccounts(accounts, publicKey, signAllTransactions, connection);
      if (result.succeeded === 0) throw new Error('No accounts were closed');

      // Notify backend (for SMELT minting + leaderboard)
      const referredBy = typeof window !== 'undefined' ? localStorage.getItem('referredBy') ?? undefined : undefined;
      await fetch('/api/recycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58(), accountsClosed: result.succeeded, referredBy }),
      }).catch(() => {});

      setDustStatus('step2');

      // Step 2: swap reclaimed SOL → SMELT
      const lamports = Math.floor(result.solReclaimed * 1e9);
      const freshQuote = await getSmeltQuote(lamports);
      if (!freshQuote) throw new Error('Could not get swap quote — your SOL was kept in wallet');

      const swapTx = await buildSwapTransaction(freshQuote, publicKey.toBase58());
      const sig = await executeSwap(swapTx, signTransaction as (tx: VersionedTransaction) => Promise<VersionedTransaction>);
      setTxSig(sig);
      setDustStatus('done');
      refreshSmelt();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setDustStatus('error');
    }
  }, [publicKey, signAllTransactions, signTransaction, accounts, refreshSmelt]);

  const estimatedSmelt = quote ? Math.floor(Number(quote.outAmount) / 1e9) : 0;
  const sol = solToReclaim(accounts.length);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Mode toggle */}
        <div className="flex rounded-xl border border-white/10 overflow-hidden">
          <button
            onClick={() => setMode('dust')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${mode === 'dust' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            ♻ Dust → SMELT
          </button>
          <button
            onClick={() => setMode('buy')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${mode === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            ⇄ Buy SMELT
          </button>
        </div>

        {/* ── DUST MODE ── */}
        {mode === 'dust' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-5">
            <div>
              <h2 className="text-zinc-100 font-semibold text-base mb-1">Convert dust directly to SMELT</h2>
              <p className="text-zinc-500 text-xs">Close your dust accounts, reclaim SOL, and swap it to SMELT — in two steps.</p>
            </div>

            {!connected && (
              <div className="text-zinc-500 text-sm">Connect your wallet to scan for dust accounts.</div>
            )}

            {connected && dustStatus === 'scanning' && (
              <div className="flex items-center gap-3 text-zinc-400 text-sm">
                <div className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin flex-shrink-0" />
                Scanning wallet…
              </div>
            )}

            {connected && dustStatus === 'ready' && accounts.length === 0 && (
              <div className="text-zinc-500 text-sm">No dust accounts found.</div>
            )}

            {connected && (dustStatus === 'ready' || dustStatus === 'step1' || dustStatus === 'step2') && accounts.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/5 border border-white/5 px-3 py-2.5">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">Accounts</div>
                    <div className="text-zinc-100 font-bold">{accounts.length}</div>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/5 px-3 py-2.5">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">SOL to reclaim</div>
                    <div className="text-zinc-100 font-bold">{sol.toFixed(4)}</div>
                  </div>
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 px-3 py-2.5 col-span-2">
                    <div className="text-[10px] text-emerald-500/50 uppercase tracking-widest mb-0.5">Est. SMELT received</div>
                    <div className="text-emerald-400 font-bold text-lg">
                      {quote ? `~${estimatedSmelt.toLocaleString()} SMELT` : '—'}
                    </div>
                    {quote && <div className="text-zinc-600 text-[10px] mt-0.5">via Jupiter · updates every 10s</div>}
                  </div>
                </div>

                {/* Step progress */}
                <div className="space-y-2">
                  {[
                    { label: 'Step 1: Close accounts + reclaim SOL', active: dustStatus === 'step1', done: dustStatus === 'step2' || dustStatus === 'done' },
                    { label: 'Step 2: Swap SOL → SMELT via Jupiter', active: dustStatus === 'step2', done: dustStatus === 'done' },
                  ].map(({ label, active, done }) => (
                    <div key={label} className="flex items-center gap-2 text-xs">
                      {done
                        ? <span className="text-emerald-400 font-bold">✓</span>
                        : active
                          ? <div className="w-3 h-3 border border-emerald-700 border-t-emerald-400 rounded-full animate-spin flex-shrink-0" />
                          : <span className="text-zinc-700">·</span>}
                      <span className={done ? 'text-emerald-400' : active ? 'text-zinc-200' : 'text-zinc-600'}>{label}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={convertToSmelt}
                  disabled={!quote || dustStatus === 'step1' || dustStatus === 'step2'}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all text-sm"
                >
                  {dustStatus === 'step1' ? 'Closing accounts…' : dustStatus === 'step2' ? 'Swapping to SMELT…' : 'Convert to SMELT'}
                </button>
              </>
            )}

            {dustStatus === 'done' && (
              <div className="text-center space-y-3">
                <div className="text-4xl">✅</div>
                <div className="text-emerald-400 font-bold">SMELT received!</div>
                {txSig && (
                  <a
                    href={`https://solscan.io/tx/${txSig}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-500 hover:text-zinc-300 underline"
                  >
                    View on Solscan
                  </a>
                )}
                <button onClick={scan} className="text-xs text-zinc-500 hover:text-zinc-300 underline block mx-auto">
                  Scan again
                </button>
              </div>
            )}

            {dustStatus === 'error' && (
              <div className="rounded-xl bg-red-500/5 border border-red-500/20 px-4 py-3 text-red-400/80 text-sm">
                {error}
                <button onClick={scan} className="block mt-2 text-xs underline text-red-400/50 hover:text-red-400/80">Try again</button>
              </div>
            )}
          </div>
        )}

        {/* ── BUY MODE ── */}
        {mode === 'buy' && (
          <div className="space-y-4">
            {/* Price comparison */}
            {smeltPrice !== null && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Market price</div>
                  <div className="text-zinc-100 font-bold">{smeltPrice.toFixed(8)} SOL</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Pending pool</div>
                  <div className="text-indigo-400 font-bold">{nav?.toFixed(4) ?? '—'} SOL</div>
                </div>
              </div>
            )}

            {/* Jupiter Terminal */}
            <div className="rounded-2xl border border-white/10 overflow-hidden min-h-[420px]">
              <div id="jupiter-terminal" ref={jupiterRef} className="w-full min-h-[420px]" />
              {!jupiterLoaded && (
                <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
                  Loading Jupiter…
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Start dev server and navigate to http://localhost:PORT/swap**

```bash
cd /c/recycle && npm run dev
```
Expected: Swap page loads. Mode toggle works. Dust tab shows scanning state when wallet connected. Buy tab shows Jupiter Terminal loading.

- [ ] **Step 4: Commit**

```bash
cd /c/recycle && git add app/swap/page.tsx && git commit -m "feat: /swap page — dust-to-SMELT atomic + Jupiter Terminal buy mode"
```

---

## Task 9: Dashboard Page

**Files:**
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Create app/dashboard/page.tsx**

```tsx
// app/dashboard/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSmelt } from '@/lib/smelt-context';
import { fetchSmeltBalance, fetchStakeInfo } from '@/lib/smelt';

interface DashboardData {
  activity: {
    weeklyAccounts: number;
    weeklyRank: number;
    allTimeAccounts: number;
    allTimeSolReclaimed: number;
    allTimeSmeltEarned: number;
  };
  referral: {
    referrals: { referee: string; accountsClosed: number; bonusEarned: number; date: string }[];
    pendingBonus: number;
    totalEarned: number;
    count: number;
  };
  distributions: {
    recent: { date: string; totalSol: number; recipientCount: number }[];
    nextDistributionDate: string | null;
  };
}

function shortAddr(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }
function formatDate(iso: string) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const { smeltBalance } = useSmelt();
  const [data, setData] = useState<DashboardData | null>(null);
  const [smeltStaked, setSmeltStaked] = useState(0n);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const load = useCallback(async () => {
    if (!publicKey) return;
    const res = await fetch(`/api/dashboard?wallet=${publicKey.toBase58()}`, { cache: 'no-store' });
    if (res.ok) setData(await res.json() as DashboardData);
    fetchStakeInfo(connection, publicKey, { publicKey, signTransaction: undefined } as never)
      .then((info) => setSmeltStaked(info?.amountStaked ?? 0n))
      .catch(() => {});
  }, [publicKey, connection]);

  useEffect(() => { if (connected && publicKey) load(); }, [connected, publicKey, load]);

  const smeltUi = Number(smeltBalance) / 1e9;
  const stakedUi = Number(smeltStaked) / 1e9;
  const unstakedUi = smeltUi - stakedUi;
  const weight = unstakedUi * 1 + stakedUi * 1.5;

  const referralLink = typeof window !== 'undefined' && publicKey
    ? `${window.location.origin}/?ref=${publicKey.toBase58()}`
    : '';

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = () => {
    if (navigator.share && referralLink) {
      navigator.share({ title: '♻ Recycler', text: 'Reclaim your SOL from dust accounts and earn SMELT!', url: referralLink });
    }
  };

  if (!mounted) return null;

  if (!connected || !publicKey) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
        <div className="text-white font-semibold">Connect your wallet to view your dashboard</div>
        <WalletMultiButton className="!bg-emerald-500 !text-white !font-semibold !text-sm !rounded-xl !px-6 !py-2.5" />
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Dashboard</h1>
          <div className="text-zinc-500 text-xs mt-1 font-mono">{shortAddr(publicKey.toBase58())}</div>
        </div>

        {/* Portfolio strip */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">Portfolio</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'SMELT Balance', value: smeltUi.toLocaleString(), sub: 'total holdings', color: 'text-emerald-400' },
              { label: 'Staked', value: stakedUi.toLocaleString(), sub: '1.5× weight active', color: 'text-zinc-100', badge: stakedUi > 0 },
              { label: 'Distribution weight', value: weight.toLocaleString(undefined, { maximumFractionDigits: 0 }), sub: `${unstakedUi.toFixed(0)} × 1 + ${stakedUi.toFixed(0)} × 1.5`, color: 'text-indigo-400' },
              { label: 'SOL earned', value: `${(data?.distributions.recent.reduce((s) => s, 0) ?? 0).toFixed(4)} SOL`, sub: 'from distributions', color: 'text-zinc-100' },
            ].map(({ label, value, sub, color, badge }) => (
              <div key={label} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-zinc-500 mb-1">{label}</div>
                <div className={`text-lg font-bold ${color} flex items-center gap-1.5`}>
                  {value}
                  {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">1.5×</span>}
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Activity */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">Activity</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Accounts closed (all-time)', value: (data?.activity.allTimeAccounts ?? 0).toLocaleString() },
              { label: 'SOL reclaimed (all-time)', value: `${(data?.activity.allTimeSolReclaimed ?? 0).toFixed(4)} SOL` },
              { label: 'SMELT earned recycling', value: (data?.activity.allTimeSmeltEarned ?? 0).toLocaleString() },
              { label: 'Accounts this week', value: (data?.activity.weeklyAccounts ?? 0).toLocaleString() },
              {
                label: 'Weekly rank',
                value: data?.activity.weeklyRank
                  ? `#${data.activity.weeklyRank}`
                  : '—',
              },
              { label: 'Referrals', value: (data?.referral.count ?? 0).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                <div className="text-xs text-zinc-500 mb-1">{label}</div>
                <div className="text-zinc-100 font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Referrals */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">Referrals</h2>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
            <div>
              <div className="text-xs text-zinc-500 mb-2">Your referral link</div>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400 font-mono truncate">
                  {referralLink}
                </div>
                <button
                  onClick={copyLink}
                  className="px-3 py-2 rounded-xl border border-white/10 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-all flex-shrink-0"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={shareLink}
                    className="px-3 py-2 rounded-xl border border-white/10 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-all flex-shrink-0"
                  >
                    Share
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Pending bonus</div>
                <div className="text-emerald-400 font-semibold">{(data?.referral.pendingBonus ?? 0).toFixed(6)} SOL</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Total earned</div>
                <div className="text-zinc-100 font-semibold">{(data?.referral.totalEarned ?? 0).toFixed(6)} SOL</div>
              </div>
            </div>

            {(data?.referral.referrals.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-zinc-600">Recent referrals</div>
                {data!.referral.referrals.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-mono">{shortAddr(r.referee)}</span>
                    <span className="text-zinc-600">{r.accountsClosed} accounts</span>
                    <span className="text-emerald-500/70">+{r.bonusEarned.toFixed(6)} SOL</span>
                    <span className="text-zinc-600">{formatDate(r.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Rewards / Distributions */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">Rewards</h2>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Next distribution</div>
                <div className="text-zinc-100 font-semibold">
                  {data?.distributions.nextDistributionDate
                    ? formatDate(data.distributions.nextDistributionDate)
                    : 'Not scheduled'}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Your weight</div>
                <div className="text-zinc-100 font-semibold">
                  {weight.toLocaleString(undefined, { maximumFractionDigits: 0 })} units
                </div>
              </div>
            </div>

            {(data?.distributions.recent.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <div className="text-xs text-zinc-600">Recent distributions (platform-wide)</div>
                {data!.distributions.recent.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-zinc-400">{formatDate(d.date)}</span>
                    <span className="text-emerald-400">{d.totalSol.toFixed(6)} SOL</span>
                    <span className="text-zinc-600">{d.recipientCount} recipients</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-zinc-600 text-sm">No distributions yet.</div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Navigate to /dashboard in browser**

Expected: page loads, shows "Connect wallet" if disconnected; shows all four sections when connected.

- [ ] **Step 4: Commit**

```bash
cd /c/recycle && git add app/dashboard/page.tsx && git commit -m "feat: /dashboard page — portfolio, activity, referrals, rewards"
```

---

## Task 10: Community Page

**Files:**
- Create: `app/community/page.tsx`

- [ ] **Step 1: Create app/community/page.tsx**

```tsx
// app/community/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { EcosystemData } from '@/lib/ecosystem';

interface LeaderboardEntry {
  wallet: string;
  accounts: number;
  solReclaimed: number;
  smeltEarned: number;
}

interface LeaderboardData {
  weekly: { since: string; entries: LeaderboardEntry[] };
  allTime: { entries: LeaderboardEntry[] };
}

type Tab = 'weekly' | 'allTime';

const PRIZES = [250, 150, 100];

function shortAddr(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }

export default function CommunityPage() {
  const { publicKey } = useWallet();
  const [eco, setEco] = useState<EcosystemData | null>(null);
  const [lb, setLb] = useState<LeaderboardData | null>(null);
  const [tab, setTab] = useState<Tab>('weekly');
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ecoRes, lbRes] = await Promise.all([
        fetch('/api/ecosystem', { cache: 'no-store' }),
        fetch('/api/leaderboard', { cache: 'no-store' }),
      ]);
      if (ecoRes.ok) setEco(await ecoRes.json() as EcosystemData);
      if (lbRes.ok) setLb(await lbRes.json() as LeaderboardData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(() => refresh(true), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refresh]);

  const currentEntries = tab === 'weekly' ? (lb?.weekly.entries ?? []) : (lb?.allTime.entries ?? []);
  const userWallet = publicKey?.toBase58() ?? '';
  const userRank = currentEntries.findIndex((e) => e.wallet === userWallet);

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Ecosystem Health */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-100">🌍 Ecosystem Health</h2>
            <span className="text-xs text-zinc-600">All-time · Solana-wide</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Wallets cleaned', value: (eco?.totalWallets ?? 0).toLocaleString(), color: 'text-emerald-400' },
              { label: 'Accounts closed', value: (eco?.totalAccountsClosed ?? 0).toLocaleString(), color: 'text-zinc-100' },
              { label: 'SOL unlocked', value: `${(eco?.totalSolReclaimed ?? 0).toFixed(2)} SOL`, color: 'text-indigo-400', sub: 'returned to users' },
              { label: 'SMELT minted', value: (eco?.totalSmeltMinted ?? 0).toLocaleString(), color: 'text-zinc-100', sub: 'earned by recyclers' },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-zinc-500 mb-1">{label}</div>
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* Leaderboard */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-100">🏆 Leaderboard</h2>
            {tab === 'weekly' && lb?.weekly.since && (
              <span className="text-xs text-zinc-600">
                Since {new Date(lb.weekly.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {/* Tab toggle */}
          <div className="flex rounded-xl border border-white/10 overflow-hidden mb-4 w-fit">
            {(['weekly', 'allTime'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${tab === t ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {t === 'weekly' ? 'This week' : 'All-time'}
              </button>
            ))}
          </div>

          {currentEntries.length === 0 ? (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-zinc-500 text-sm">
              No recycling activity yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-500 text-xs">
                    <th className="text-left px-4 py-3 w-8">#</th>
                    <th className="text-left px-4 py-3">Wallet</th>
                    <th className="text-right px-4 py-3">Accounts</th>
                    <th className="text-right px-4 py-3 hidden sm:table-cell">SOL reclaimed</th>
                    {tab === 'weekly' && <th className="text-right px-4 py-3 hidden sm:table-cell">Prize</th>}
                  </tr>
                </thead>
                <tbody>
                  {currentEntries.map((entry, i) => {
                    const isUser = entry.wallet === userWallet;
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                    return (
                      <tr
                        key={entry.wallet}
                        className={`border-b border-white/5 last:border-0 ${isUser ? 'bg-emerald-500/5' : ''}`}
                      >
                        <td className="px-4 py-3 text-zinc-500 text-xs">{medal ?? i + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-300">
                          {shortAddr(entry.wallet)}
                          {isUser && <span className="ml-2 text-emerald-400 text-[10px] font-semibold">you</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-200 font-semibold">{entry.accounts}</td>
                        <td className="px-4 py-3 text-right text-zinc-400 hidden sm:table-cell">{entry.solReclaimed.toFixed(4)}</td>
                        {tab === 'weekly' && (
                          <td className="px-4 py-3 text-right hidden sm:table-cell">
                            {PRIZES[i] ? (
                              <span className="text-xs text-emerald-400/70">+{PRIZES[i]} SMELT</span>
                            ) : (
                              <span className="text-zinc-700">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pinned user row if outside top 20 */}
              {userRank === -1 && userWallet && (
                <div className="border-t border-white/10 px-4 py-3 flex items-center justify-between text-xs bg-emerald-500/5">
                  <span className="text-zinc-500">Your rank: not in top 20</span>
                  <span className="text-zinc-400 font-mono">{shortAddr(userWallet)}</span>
                  <span className="text-emerald-400 text-[10px]">you</span>
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Navigate to /community in browser**

Expected: ecosystem health cards show (all zeros initially). Leaderboard shows empty state. Tab toggle between weekly/all-time works.

- [ ] **Step 4: Commit**

```bash
cd /c/recycle && git add app/community/page.tsx && git commit -m "feat: /community page — ecosystem health dashboard + leaderboard"
```

---

## Task 11: Referral Passthrough in Recycle Page

The existing `app/page.tsx` recycle flow needs to pass `referredBy` to `/api/recycle`.

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update the recycle function in app/page.tsx**

Find the `fetch('/api/recycle', ...)` call (around line 101) and replace:

```typescript
fetch('/api/recycle', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ wallet: publicKey.toBase58(), accountsClosed: result.succeeded }),
})
```

Replace with:

```typescript
const referredBy = typeof window !== 'undefined' ? localStorage.getItem('referredBy') ?? undefined : undefined;
fetch('/api/recycle', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ wallet: publicKey.toBase58(), accountsClosed: result.succeeded, referredBy }),
})
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Final build check**

```bash
cd /c/recycle && npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully` or equivalent. No type errors.

- [ ] **Step 4: Commit**

```bash
cd /c/recycle && git add app/page.tsx && git commit -m "feat: pass referredBy from localStorage in recycle flow"
```

---

## Self-Review Checklist

- [x] **Mobile wallet fix** — providers.tsx adds SolflareWalletAdapter, casts to `Adapter[]`
- [x] **Data helpers** — leaderboard.ts, referrals.ts, ecosystem.ts all created with matching types
- [x] **`/api/recycle` extension** — accepts `referredBy`, calls all three helpers; `isNewWallet` detection via `getWalletStats` called before `recordLeaderboard`
- [x] **API routes** — /api/ecosystem, /api/leaderboard, /api/dashboard all use types from lib helpers
- [x] **Referral detection** — `ReferralDetector` component reads `?ref=`, saves to localStorage; `app/page.tsx` and swap page both read from localStorage
- [x] **Nav** — 5 items: Recycle, Swap, Community, Pools, How it works; Dashboard shown conditionally
- [x] **Jupiter swap** — quote, price, buildSwapTransaction, executeSwap all defined; used in swap page with correct types
- [x] **Swap page** — dust mode and buy mode, progress steps, error handling on step 2 (user keeps SOL)
- [x] **Dashboard** — all four sections, referral link built from `window.location.origin`, `navigator.share` guard
- [x] **Community** — ecosystem health 4 cards, leaderboard with tab toggle, pinned user row
- [x] **Type consistency** — `LeaderboardEntry` defined in `lib/leaderboard.ts`, imported by API routes; `EcosystemData` exported from `lib/ecosystem.ts`, imported by community page
