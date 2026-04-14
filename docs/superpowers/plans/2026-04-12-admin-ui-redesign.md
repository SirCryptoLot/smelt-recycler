# Admin UI + App Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-page top nav with a unified persistent sidebar, add a full admin dashboard at `/admin/[secret]`, and add a How it Works page.

**Architecture:** A `SmeltContext` holds shared SMELT balance state across pages. `AppShell` is a persistent sidebar shell wrapping all routes via `app/layout.tsx`; it auto-bypasses itself on `/admin/*` routes so admin provides its own full layout. Admin APIs validate `ADMIN_SECRET` from `.env.local`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, `@solana/wallet-adapter-react`, Jest + `@testing-library/react`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `lib/smelt-context.tsx` | Shared SMELT balance + refresh callback, React context |
| Create | `components/AppShell.tsx` | Persistent sidebar: brand, nav links, wallet section, NAV display |
| Modify | `app/layout.tsx` | Wrap children in `<Providers><AppShell>` instead of `<Nav>` |
| Modify | `app/page.tsx` | Remove sidebar JSX; add stats strip; call `useSmelt()` for refresh |
| Modify | `app/pools/page.tsx` | Remove full-page bg/overflow wrapper (AppShell provides it) |
| Create | `app/how-it-works/page.tsx` | Static explainer: dust, recycling, SMELT, vault, FAQ |
| Create | `app/api/admin/stats/route.ts` | Combined stats: vault tokens + prices, SMELT supply, file data, NAV |
| Create | `app/api/admin/run/route.ts` | Spawns `npm run liquidate` or `npm run distribute`, streams output |
| Create | `app/admin/[token]/page.tsx` | Full admin dashboard: own sidebar, 5 sections, action terminal |
| Create | `.env.local` | `ADMIN_SECRET=recycler-admin-2026` (local only, gitignored) |
| Delete | `components/Nav.tsx` | Replaced by AppShell nav |
| Modify | `app/__tests__/page.test.tsx` | Remove assertion for `Connect Wallet` button (moved to AppShell) |

---

## Task 1: SmeltContext — shared SMELT balance state

**Files:**
- Create: `lib/smelt-context.tsx`
- Create: `lib/__tests__/smelt-context.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/__tests__/smelt-context.test.ts
import { renderHook, act } from '@testing-library/react';
import { SmeltProvider, useSmelt } from '../smelt-context';
import { fetchSmeltBalance } from '../smelt';
import { PublicKey } from '@solana/web3.js';

jest.mock('../smelt', () => ({ fetchSmeltBalance: jest.fn() }));
jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn(() => ({ publicKey: null })),
  useConnection: jest.fn(() => ({ connection: {} })),
}));

import { useWallet } from '@solana/wallet-adapter-react';
const mockFetch = fetchSmeltBalance as jest.Mock;
const mockUseWallet = useWallet as jest.Mock;

it('returns 0n when no wallet connected', () => {
  const { result } = renderHook(() => useSmelt(), { wrapper: SmeltProvider });
  expect(result.current.smeltBalance).toBe(0n);
});

it('fetches balance when wallet connects', async () => {
  const pk = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');
  mockFetch.mockResolvedValue(500_000_000_000n);
  mockUseWallet.mockReturnValue({ publicKey: pk });
  const { result } = renderHook(() => useSmelt(), { wrapper: SmeltProvider });
  await act(async () => {});
  expect(result.current.smeltBalance).toBe(500_000_000_000n);
});

it('refreshSmelt re-fetches balance', async () => {
  const pk = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');
  mockFetch.mockResolvedValue(0n);
  mockUseWallet.mockReturnValue({ publicKey: pk });
  const { result } = renderHook(() => useSmelt(), { wrapper: SmeltProvider });
  await act(async () => {});
  mockFetch.mockResolvedValue(1_000_000_000n);
  await act(async () => { result.current.refreshSmelt(); });
  expect(result.current.smeltBalance).toBe(1_000_000_000n);
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- lib/__tests__/smelt-context.test.ts
```
Expected: FAIL — `Cannot find module '../smelt-context'`

- [ ] **Step 3: Implement SmeltContext**

```typescript
// lib/smelt-context.tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { fetchSmeltBalance } from './smelt';

interface SmeltContextValue {
  smeltBalance: bigint;
  refreshSmelt: () => void;
}

const SmeltContext = createContext<SmeltContextValue>({
  smeltBalance: 0n,
  refreshSmelt: () => {},
});

export function SmeltProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [smeltBalance, setSmeltBalance] = useState(0n);

  const refreshSmelt = useCallback(() => {
    if (!publicKey) return;
    fetchSmeltBalance(connection, publicKey).then(setSmeltBalance).catch(console.error);
  }, [publicKey, connection]);

  useEffect(() => {
    if (!publicKey) { setSmeltBalance(0n); return; }
    refreshSmelt();
  }, [refreshSmelt, publicKey]);

  return (
    <SmeltContext.Provider value={{ smeltBalance, refreshSmelt }}>
      {children}
    </SmeltContext.Provider>
  );
}

export function useSmelt(): SmeltContextValue {
  return useContext(SmeltContext);
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- lib/__tests__/smelt-context.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/smelt-context.tsx lib/__tests__/smelt-context.test.ts
git commit -m "feat: add SmeltContext for shared SMELT balance across pages"
```

---

## Task 2: AppShell — persistent sidebar

**Files:**
- Create: `components/AppShell.tsx`
- Create: `components/__tests__/AppShell.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// components/__tests__/AppShell.test.tsx
import { render, screen } from '@testing-library/react';
import { AppShell } from '../AppShell';

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn(() => ({ publicKey: null, connected: false, disconnect: jest.fn() })),
  useConnection: jest.fn(() => ({ connection: {} })),
}));
jest.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletMultiButton: () => <button>Connect Wallet</button>,
}));
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
}));
jest.mock('@/lib/smelt-context', () => ({
  useSmelt: jest.fn(() => ({ smeltBalance: 0n, refreshSmelt: jest.fn() })),
}));

it('renders nav links', () => {
  render(<AppShell><div>content</div></AppShell>);
  expect(screen.getByText('Recycle')).toBeInTheDocument();
  expect(screen.getByText('Pools')).toBeInTheDocument();
  expect(screen.getByText('How it works')).toBeInTheDocument();
});

it('renders brand name', () => {
  render(<AppShell><div>content</div></AppShell>);
  expect(screen.getByText('Recycler')).toBeInTheDocument();
});

it('renders children', () => {
  render(<AppShell><div>my-content</div></AppShell>);
  expect(screen.getByText('my-content')).toBeInTheDocument();
});

it('renders connect button when wallet not connected', () => {
  render(<AppShell><div /></AppShell>);
  expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- components/__tests__/AppShell.test.tsx
```
Expected: FAIL — `Cannot find module '../AppShell'`

- [ ] **Step 3: Implement AppShell**

```typescript
// components/AppShell.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSmelt } from '@/lib/smelt-context';
import { useConnection } from '@solana/wallet-adapter-react';
import { Connection } from '@solana/web3.js';
import { SMELT_MINT } from '@/lib/constants';

const NAV_ITEMS = [
  { href: '/', label: 'Recycle', icon: '♻' },
  { href: '/pools', label: 'Pools', icon: '🏊' },
  { href: '/how-it-works', label: 'How it works', icon: '📖' },
];

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { publicKey, connected, disconnect } = useWallet();
  const { connection } = useConnection();
  const { smeltBalance } = useSmelt();
  const [mounted, setMounted] = useState(false);
  const [pendingSol, setPendingSol] = useState(0);
  const [totalSupply, setTotalSupply] = useState(0);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch('/api/stats', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setPendingSol(
          (d.liquidations?.undistributedSol ?? 0) + (d.fees?.undistributedSol ?? 0)
        );
      })
      .catch(() => {});

    (connection as Connection).getTokenSupply(SMELT_MINT)
      .then((s) => setTotalSupply(s.value.uiAmount ?? 0))
      .catch(() => {});
  }, [connection]);

  const smeltUi = Number(smeltBalance) / 1e9;
  const nav = totalSupply > 0 && pendingSol > 0
    ? (pendingSol / totalSupply).toFixed(6)
    : '0.000000';

  // Admin pages provide their own full-screen layout
  if (pathname.startsWith('/admin')) {
    return (
      <div className="h-screen bg-[#060f0d] text-white overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#060f0d] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-white/5 bg-[#09140f]">
        {/* Brand */}
        <div className="px-5 pt-6 pb-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-lg leading-none">
              ♻
            </div>
            <div>
              <div className="text-white font-bold text-sm tracking-tight">Recycler</div>
              <div className="text-emerald-500/50 text-[11px]">Reclaim your SOL</div>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex flex-col gap-1 p-3">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                  active
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
                ].join(' ')}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Wallet section */}
        <div className="p-4 border-t border-white/5">
          {connected && publicKey ? (
            <>
              <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 mb-3 space-y-1.5">
                <div className="text-[10px] font-semibold tracking-widest text-white/25 uppercase">
                  Wallet
                </div>
                <div className="text-white/70 text-xs font-mono">
                  {shortAddr(publicKey.toBase58())}
                </div>
                <div className="flex justify-between text-xs pt-1">
                  <span className="text-zinc-500">SMELT</span>
                  <span className="text-zinc-200">{smeltUi.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">NAV</span>
                  <span className="text-indigo-400">{nav} SOL</span>
                </div>
              </div>
              <button
                onClick={() => disconnect()}
                className="w-full text-white/30 text-xs rounded-xl py-2.5 border border-white/5 hover:border-white/10 hover:text-white/50 transition-all"
              >
                Disconnect
              </button>
            </>
          ) : mounted ? (
            <WalletMultiButton className="!w-full !bg-emerald-500 !text-white !font-semibold !text-sm !rounded-xl !justify-center !py-2.5" />
          ) : (
            <div className="h-10 w-full rounded-xl bg-emerald-500/20 animate-pulse" />
          )}
        </div>
      </aside>

      {/* Page content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- components/__tests__/AppShell.test.tsx
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/AppShell.tsx components/__tests__/AppShell.test.tsx
git commit -m "feat: add AppShell persistent sidebar component"
```

---

## Task 3: Update root layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update layout to use AppShell + SmeltProvider**

Replace the entire file:

```typescript
// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AppShell } from '@/components/AppShell';
import { SmeltProvider } from '@/lib/smelt-context';

export const metadata: Metadata = {
  title: '♻ Recycler',
  description: 'Reclaim your SOL from dust accounts',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SmeltProvider>
            <AppShell>{children}</AppShell>
          </SmeltProvider>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Run the build to verify no errors**

```
npm run build
```
Expected: Build passes. `/` and `/pools` listed in routes.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wire AppShell and SmeltProvider into root layout"
```

---

## Task 4: Update Recycle page

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/__tests__/page.test.tsx`

- [ ] **Step 1: Update page.tsx — remove sidebar, add stats strip, use SmeltContext**

Replace the full file content. Key changes:
- Remove `smeltBalance`, `smeltStaked`, `stakeOpen`, `stakeMode`, `stakeInput`, `stakeLoading`, `stakeError` state
- Remove import of `buildStakeTransaction`, `buildUnstakeTransaction`, `fetchStakeInfo`
- Add `useSmelt()` call, use `refreshSmelt` after recycling
- Remove the `<aside>` and outer `<div className="flex h-screen ...">` wrapper
- Add stats strip when `status === 'results'`
- Return a bare `<div>` (AppShell provides the outer flex container)

```typescript
// app/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  getTrashAccounts,
  solToReclaim,
  TrashAccount,
  connection,
  fetchTokenMetas,
  TokenMeta,
} from '@/lib/solana';
import { recycleAccounts } from '@/lib/recycle';
import { useSmelt } from '@/lib/smelt-context';
import { currentSmeltPerAccount } from '@/lib/constants';

type Status = 'disconnected' | 'scanning' | 'results' | 'empty' | 'error' | 'recycling' | 'success';

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-sky-500', 'bg-teal-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-orange-500', 'bg-rose-500',
  'bg-pink-500', 'bg-purple-500', 'bg-indigo-500', 'bg-cyan-500',
];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function Home() {
  const { publicKey, connected, signAllTransactions } = useWallet();
  const { refreshSmelt } = useSmelt();
  const [status, setStatus] = useState<Status>('disconnected');
  const [accounts, setAccounts] = useState<TrashAccount[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [tokenMetas, setTokenMetas] = useState<Record<string, TokenMeta>>({});
  const [error, setError] = useState('');
  const [recycleResult, setRecycleResult] = useState<{
    succeeded: number;
    failed: number;
    solReclaimed: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const scan = useCallback(async () => {
    setStatus('scanning');
    setError('');
    setTokenMetas({});
    try {
      if (!publicKey) return;
      const result = await getTrashAccounts(publicKey);
      if (result.length === 0) {
        setStatus('empty');
      } else {
        setAccounts(result);
        setSelectedKeys(new Set(result.map((a) => a.pubkey.toBase58())));
        setStatus('results');
        fetchTokenMetas(result.map((a) => a.mint.toBase58())).then(setTokenMetas);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }, [publicKey]);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedKeys((prev) =>
      prev.size === accounts.length
        ? new Set()
        : new Set(accounts.map((a) => a.pubkey.toBase58()))
    );
  }, [accounts]);

  const recycle = useCallback(async () => {
    if (!publicKey || !signAllTransactions) return;
    const selected = accounts.filter((a) => selectedKeys.has(a.pubkey.toBase58()));
    if (selected.length === 0) return;
    setStatus('recycling');
    try {
      const result = await recycleAccounts(selected, publicKey, signAllTransactions, connection);
      setRecycleResult(result);
      if (result.succeeded > 0) {
        fetch('/api/recycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: publicKey.toBase58(), accountsClosed: result.succeeded }),
        })
          .then(() => refreshSmelt())
          .catch(() => {});
      }
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction cancelled');
      setStatus('results');
    }
  }, [accounts, selectedKeys, publicKey, signAllTransactions, refreshSmelt]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setStatus('disconnected');
      setAccounts([]);
      setSelectedKeys(new Set());
      return;
    }
    scan();
  }, [connected, publicKey, scan]);

  const selected = accounts.filter((a) => selectedKeys.has(a.pubkey.toBase58()));
  const sol = solToReclaim(selected.length);
  const allSelected = accounts.length > 0 && selectedKeys.size === accounts.length;
  const totalUsd = selected.reduce((s, a) => s + a.usdValue, 0);
  const smeltReward = selected.length * currentSmeltPerAccount();

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Stats strip — shown only when accounts loaded */}
      {status === 'results' && (
        <div className="flex gap-4 px-6 py-4 border-b border-white/5 flex-shrink-0">
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 flex-1">
            <div className="text-[10px] font-semibold tracking-widest text-emerald-500/50 uppercase mb-0.5">
              SOL to reclaim
            </div>
            <div className="text-white font-bold text-xl tracking-tight">{sol.toFixed(4)}</div>
            <div className="text-white/25 text-[11px] mt-0.5">
              {selected.length} / {accounts.length} selected
            </div>
          </div>
          {totalUsd > 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 flex-1">
              <div className="text-[10px] font-semibold tracking-widest text-white/25 uppercase mb-0.5">
                Dust value
              </div>
              <div className="text-white/50 font-bold text-xl">${totalUsd.toFixed(4)}</div>
            </div>
          )}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 flex-1">
            <div className="text-[10px] font-semibold tracking-widest text-white/25 uppercase mb-0.5">
              SMELT reward
            </div>
            <div className="text-emerald-400 font-bold text-xl">+{smeltReward.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Disconnected */}
      {status === 'disconnected' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-10">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center text-3xl">
            🔌
          </div>
          <div className="text-center">
            <div className="text-white font-semibold text-lg">Connect your wallet</div>
            <div className="text-white/30 text-sm mt-1.5 max-w-xs">
              Connect Phantom to scan for dust token accounts and reclaim rent SOL
            </div>
          </div>
          {mounted && (
            <WalletMultiButton className="!bg-emerald-500 !text-white !font-semibold !text-sm !rounded-xl !px-6 !py-2.5" />
          )}
        </div>
      )}

      {/* Scanning */}
      {status === 'scanning' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
          <div className="text-center">
            <div className="text-white font-semibold">Scanning accounts…</div>
            <div className="text-white/30 text-sm mt-1">Fetching prices from Jupiter</div>
          </div>
        </div>
      )}

      {/* Results */}
      {status === 'results' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
            <span className="text-white/30 text-xs font-semibold tracking-widest uppercase">
              {accounts.length} trash account{accounts.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={toggleAll}
              className="text-white/30 text-xs hover:text-emerald-400 transition-colors"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {error && (
            <div className="mx-6 mt-4 flex-shrink-0 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-red-400/70 text-sm">
              {error}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {accounts.map((account) => {
              const key = account.pubkey.toBase58();
              const mintStr = account.mint.toBase58();
              const meta: TokenMeta | undefined = tokenMetas[mintStr];
              const isSelected = selectedKeys.has(key);
              const symbol = meta?.symbol || '???';
              const name = meta?.name || 'Unknown token';
              const initials = symbol !== '???' ? symbol.slice(0, 2).toUpperCase() : mintStr.slice(0, 2).toUpperCase();
              const color = avatarColor(mintStr);
              return (
                <div
                  key={key}
                  onClick={() => toggleSelect(key)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 cursor-pointer select-none transition-all ${
                    isSelected
                      ? 'border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/8'
                      : 'border-white/4 bg-white/[0.02] opacity-40 hover:opacity-60'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-white text-sm font-semibold truncate">{name}</span>
                      {meta?.symbol && (
                        <span className="text-white/30 text-xs flex-shrink-0 font-mono">{meta.symbol}</span>
                      )}
                    </div>
                    <div className="text-white/20 text-[11px] font-mono mt-0.5">{shortAddr(mintStr)}</div>
                  </div>
                  <div className="text-right flex-shrink-0 mr-2">
                    {account.balance === 0 ? (
                      <div className="inline-flex items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400/70 tracking-wide">
                        EMPTY
                      </div>
                    ) : (
                      <>
                        <div className="text-white/70 text-sm font-semibold tabular-nums">
                          {account.usdValue > 0.0001 ? `$${account.usdValue.toFixed(4)}` : '<$0.01'}
                        </div>
                        <div className="text-white/20 text-[11px] mt-0.5 tabular-nums">
                          {account.balance.toLocaleString()} tkn
                        </div>
                      </>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(key)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-emerald-500 w-4 h-4 flex-shrink-0 cursor-pointer"
                  />
                </div>
              );
            })}
          </div>
          <div className="px-6 py-4 border-t border-white/5 flex-shrink-0 bg-[#060f0d]">
            <button
              onClick={recycle}
              disabled={!signAllTransactions || selected.length === 0}
              className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-25 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all text-sm"
            >
              ♻ Recycle {selected.length} account{selected.length !== 1 ? 's' : ''} · reclaim {sol.toFixed(4)} SOL
            </button>
          </div>
        </div>
      )}

      {/* Recycling */}
      {status === 'recycling' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
          <div className="text-center">
            <div className="text-white font-semibold">
              Recycling {selected.length} account{selected.length !== 1 ? 's' : ''}…
            </div>
            <div className="text-white/30 text-sm mt-1">Approve in Phantom, then wait for confirmation</div>
          </div>
        </div>
      )}

      {/* Success */}
      {status === 'success' && recycleResult && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center text-3xl">
            ✅
          </div>
          <div className="text-center">
            <div className="text-white font-bold text-2xl tracking-tight">
              ~{recycleResult.solReclaimed.toFixed(4)} SOL
            </div>
            <div className="text-white/30 text-sm mt-1.5">
              reclaimed from {recycleResult.succeeded} account{recycleResult.succeeded !== 1 ? 's' : ''}
            </div>
            {recycleResult.failed > 0 && (
              <div className="text-amber-400/60 text-sm mt-1">{recycleResult.failed} failed</div>
            )}
          </div>
          <button
            onClick={scan}
            className="border border-white/8 text-white/40 text-sm rounded-xl px-5 py-2.5 hover:border-white/15 hover:text-white/60 transition-all"
          >
            Scan again
          </button>
        </div>
      )}

      {/* Empty */}
      {status === 'empty' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center text-3xl">
            ✅
          </div>
          <div className="text-center">
            <div className="text-white font-semibold text-lg">Nothing to recycle</div>
            <div className="text-white/30 text-sm mt-1">Your wallet is clean.</div>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="rounded-2xl border border-red-500/15 bg-red-500/5 px-6 py-5 max-w-sm w-full text-center">
            <div className="text-red-400 font-semibold mb-1">Scan failed</div>
            <div className="text-red-400/50 text-sm">{error}</div>
          </div>
          <button
            onClick={scan}
            className="border border-white/8 text-white/40 text-sm rounded-xl px-5 py-2.5 hover:border-white/15 hover:text-white/60 transition-all"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the page test — remove Connect Wallet button assertion**

In `app/__tests__/page.test.tsx`, find and update the disconnected test. The `Connect Wallet` button is now in AppShell, not Home. Remove that assertion:

```typescript
// Replace this test:
it('shows connect prompt and Connect button when disconnected', () => {
  // ...
  expect(screen.getByText('Connect your wallet')).toBeInTheDocument();
  expect(screen.getByText('Connect Wallet')).toBeInTheDocument();  // ← REMOVE this line
});

// With this:
it('shows connect prompt when disconnected', () => {
  mockUseWallet.mockReturnValue({
    publicKey: null,
    connected: false,
    disconnect: jest.fn(),
    signAllTransactions: jest.fn(async (txs: any[]) => txs),
  });
  render(<Home />);
  expect(screen.getByText('Connect your wallet')).toBeInTheDocument();
});
```

Also add mocks for `smelt-context` and `constants` at the top of the test file:

```typescript
jest.mock('@/lib/smelt-context', () => ({
  useSmelt: jest.fn(() => ({ smeltBalance: 0n, refreshSmelt: jest.fn() })),
}));
jest.mock('@/lib/constants', () => ({
  ...jest.requireActual('@/lib/constants'),
  currentSmeltPerAccount: jest.fn(() => 250),
}));
```

- [ ] **Step 3: Run the tests**

```
npm test -- app/__tests__/page.test.tsx
```
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat: remove sidebar from Recycle page, add stats strip, use SmeltContext"
```

---

## Task 5: Update Pools page

**Files:**
- Modify: `app/pools/page.tsx`

- [ ] **Step 1: Remove full-page layout wrapper**

The pools page currently wraps everything in `<main className="min-h-screen bg-zinc-950 text-white">`. AppShell now provides that. Replace the outer wrapper:

Find and replace in `app/pools/page.tsx`:

```typescript
// BEFORE — loading state:
return (
  <main className="min-h-screen bg-zinc-950 text-white p-8">
    <div className="max-w-4xl mx-auto space-y-4">

// AFTER:
return (
  <main className="flex-1 overflow-y-auto p-8">
    <div className="max-w-4xl mx-auto space-y-4">
```

```typescript
// BEFORE — main return:
return (
  <main className="min-h-screen bg-zinc-950 text-white">
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

// AFTER:
return (
  <main className="flex-1 overflow-y-auto">
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
```

- [ ] **Step 2: Run build to verify no errors**

```
npm run build
```
Expected: Build passes, `/pools` still listed as static route.

- [ ] **Step 3: Commit**

```bash
git add app/pools/page.tsx
git commit -m "feat: update Pools page to use AppShell layout"
```

---

## Task 6: How it Works page

**Files:**
- Create: `app/how-it-works/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// app/how-it-works/page.tsx
export default function HowItWorksPage() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">

        <div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">How it works</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Recycler helps you clean up your Solana wallet and reclaim locked SOL — with a small
            reward token (SMELT) for every account you close.
          </p>
        </div>

        {/* Section 1 */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-200">What is dust?</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Every SPL token account on Solana requires a minimum balance of ~<strong className="text-zinc-300">0.002 SOL</strong> to
            exist — this is called <em>rent exemption</em>. Over time, wallets accumulate dozens of
            accounts holding tiny or zero balances from old airdrops, failed trades, or forgotten
            positions. These accounts lock up your SOL even though the tokens inside are worth
            almost nothing.
          </p>
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-zinc-400">
            A wallet with <strong className="text-zinc-300">20 dust accounts</strong> has{' '}
            <strong className="text-zinc-300">~0.04 SOL</strong> locked up — about{' '}
            <strong className="text-zinc-300">$6–8</strong> at current prices.
          </div>
        </section>

        {/* Section 2 */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-200">How recycling works</h2>
          <ol className="space-y-2 text-sm text-zinc-400">
            {[
              ['Scan', 'Connect your wallet. Recycler checks all your token accounts and flags any with a USD value under $0.10 as recyclable.'],
              ['Select', 'Review the list. Deselect any accounts you want to keep. You are always in control.'],
              ['Approve', 'Click Recycle. One transaction is sent to Phantom for your approval — no repeated popups.'],
              ['Reclaim', 'For each closed account, Solana returns ~0.002 SOL to your wallet. Recycler keeps a 5% platform fee.'],
              ['Earn SMELT', 'After closing, the platform mints SMELT tokens to your wallet as a reward.'],
            ].map(([title, desc], i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span><strong className="text-zinc-300">{title}:</strong> {desc}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Section 3 */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-200">What is SMELT?</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            SMELT is the platform reward token. You earn it every time you recycle accounts. The
            emission rate starts at <strong className="text-zinc-300">250 SMELT per account</strong> and
            halves every 6 months — similar to Bitcoin&apos;s halving schedule.
          </p>
          <p className="text-zinc-400 text-sm leading-relaxed">
            SMELT holders receive a proportional share of the platform&apos;s accumulated SOL (from
            liquidations and recycling fees) in regular distributions. The{' '}
            <strong className="text-zinc-300">NAV</strong> (Net Asset Value) shown in the sidebar is
            the current SOL value of the pending pool divided by total circulating supply — it tells
            you exactly what each SMELT token is worth right now.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-200">The Vault</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            When you recycle, your dust tokens are transferred to the platform Vault before the
            account is closed. The Vault accumulates tokens over time. When any single token&apos;s
            balance exceeds <strong className="text-zinc-300">$10 USD</strong>, it is automatically
            swapped to SOL via Jupiter (best-price DEX routing on Solana) and added to the
            distribution pool.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-200">Distributions</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Accumulated SOL — from vault liquidations and the 5% recycling fee — is distributed
            weekly to all SMELT token holders. Your share is proportional to your holdings.
            Staked SMELT earns a <strong className="text-zinc-300">1.5× weight boost</strong>.
          </p>
        </section>

        {/* FAQ */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-200">FAQ</h2>
          {[
            ['Is it safe?', 'Yes. Every transaction is shown in Phantom for your approval before anything happens on-chain. The platform never has custody of your SOL.'],
            ["What's the 5% fee for?", 'It covers platform operating costs and flows into the SMELT distribution pool, so SMELT holders benefit directly from recycling activity.'],
            ['Why Jupiter?', 'Jupiter aggregates all major Solana DEXes to find the best swap price for vault tokens. This maximises SOL returned to the distribution pool.'],
            ['Can I lose tokens?', 'Only tokens you explicitly select are recycled. Tokens worth more than $0.10 are never shown as recyclable — only true dust and empty accounts appear.'],
            ['When are distributions?', 'Approximately weekly. You can see the next scheduled date in the Pools page.'],
          ].map(([q, a]) => (
            <div key={q as string} className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
              <div className="text-zinc-200 text-sm font-medium mb-1">{q}</div>
              <div className="text-zinc-400 text-sm leading-relaxed">{a}</div>
            </div>
          ))}
        </section>

      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run build**

```
npm run build
```
Expected: `/how-it-works` appears as a new static route.

- [ ] **Step 3: Commit**

```bash
git add app/how-it-works/page.tsx
git commit -m "feat: add How it Works explainer page"
```

---

## Task 7: Admin stats API

**Files:**
- Create: `app/api/admin/stats/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/admin/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  VAULT_PUBKEY,
  SMELT_MINT,
  LIQUIDATION_THRESHOLD_USD,
  currentSmeltPerAccount,
  PROGRAM_START_TIMESTAMP,
  EPOCH_DURATION_MS,
} from '@/lib/constants';
import { MAINNET_RPC } from '@/lib/solana';

interface LiquidationEntry {
  date: string; mint: string; amountIn: number;
  solReceived: number; txSignature: string; distributed: boolean;
}
interface DistributionEntry {
  date: string; totalSol: number; recipientCount: number; txSignatures: string[];
}
interface FeeEntry {
  date: string; wallet: string; accountsClosed: number; solFees: number; distributed: boolean;
}

function loadJson<T>(filepath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
  } catch { return fallback; }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const DATA = path.join(process.cwd(), 'data');
  const liquidations = loadJson<LiquidationEntry[]>(`${DATA}/liquidations.json`, []);
  const distributions = loadJson<DistributionEntry[]>(`${DATA}/distributions.json`, []);
  const fees = loadJson<FeeEntry[]>(`${DATA}/fees.json`, []);

  // File-based stats
  const undistributedLiqSol = liquidations.filter((l) => !l.distributed).reduce((s, l) => s + l.solReceived, 0);
  const undistributedFeeSol = fees.filter((f) => !f.distributed).reduce((s, f) => s + f.solFees, 0);
  const totalAccountsClosed = fees.reduce((s, f) => s + f.accountsClosed, 0);
  const totalFeeSol = fees.reduce((s, f) => s + f.solFees, 0);
  const totalSolDistributed = distributions.reduce((s, d) => s + d.totalSol, 0);
  const lastDistribution = [...distributions].reverse().find(Boolean) ?? null;
  const pendingSol = undistributedLiqSol + undistributedFeeSol;

  let nextDistributionDate: string | null = null;
  if (lastDistribution) {
    const d = new Date(lastDistribution.date);
    d.setDate(d.getDate() + 7);
    nextDistributionDate = d.toISOString();
  }

  // Epoch info
  const elapsed = Date.now() - PROGRAM_START_TIMESTAMP;
  const currentEpoch = Math.max(0, Math.floor(elapsed / EPOCH_DURATION_MS));
  const nextEpochAt = PROGRAM_START_TIMESTAMP + (currentEpoch + 1) * EPOCH_DURATION_MS;
  const msUntilHalving = Math.max(0, nextEpochAt - Date.now());

  // Chain data
  const connection = new Connection(MAINNET_RPC, 'confirmed');

  let smeltSupply = 0;
  try {
    const s = await connection.getTokenSupply(SMELT_MINT);
    smeltSupply = s.value.uiAmount ?? 0;
  } catch { /* use 0 */ }

  let vaultTokens: Array<{ mint: string; uiAmount: number; usdValue: number; pctOfThreshold: number }> = [];
  let vaultTotalUsd = 0;
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, {
      programId: TOKEN_PROGRAM_ID,
    });
    const tokens = accounts.value
      .map((a) => {
        const info = a.account.data.parsed.info as {
          mint: string; tokenAmount: { uiAmount: number | null };
        };
        return { mint: info.mint, uiAmount: info.tokenAmount.uiAmount ?? 0 };
      })
      .filter((t) => t.uiAmount > 0);

    let prices: Record<string, number> = {};
    if (tokens.length > 0) {
      const mints = tokens.map((t) => t.mint).join(',');
      try {
        const res = await fetch(`https://price.jup.ag/v6/price?ids=${mints}`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json() as { data: Record<string, { price: number }> };
          prices = Object.fromEntries(Object.entries(json.data).map(([m, d]) => [m, d.price]));
        }
      } catch { /* use zero prices */ }
    }

    vaultTokens = tokens.map((t) => {
      const usdValue = t.uiAmount * (prices[t.mint] ?? 0);
      vaultTotalUsd += usdValue;
      return {
        mint: t.mint,
        uiAmount: t.uiAmount,
        usdValue,
        pctOfThreshold: Math.min(100, (usdValue / LIQUIDATION_THRESHOLD_USD) * 100),
      };
    });
  } catch { /* use empty vault */ }

  const nav = smeltSupply > 0 ? pendingSol / smeltSupply : 0;

  return NextResponse.json({
    vault: { tokens: vaultTokens, totalUsd: vaultTotalUsd },
    smelt: {
      supply: smeltSupply,
      epochRate: currentSmeltPerAccount(),
      currentEpoch,
      msUntilHalving,
      nav,
    },
    fees: {
      totalCollected: totalFeeSol,
      undistributedSol: undistributedFeeSol,
      totalAccountsClosed,
    },
    liquidations: {
      recent: liquidations.slice(-10).reverse(),
      undistributedSol: undistributedLiqSol,
    },
    distributions: {
      recent: distributions.slice(-10).reverse(),
      totalSolDistributed,
      lastDistribution,
      nextDistributionDate,
    },
    pending: { totalSol: pendingSol },
  });
}
```

- [ ] **Step 2: Smoke-test manually**

Start dev server (`npm run dev`) and visit:
```
http://localhost:3001/api/admin/stats?secret=recycler-admin-2026
```
Expected: JSON response with `vault`, `smelt`, `fees`, `liquidations`, `distributions`, `pending` keys.

Visit without secret:
```
http://localhost:3001/api/admin/stats
```
Expected: `{"error":"Unauthorized"}` with status 401.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/stats/route.ts
git commit -m "feat: add /api/admin/stats endpoint with secret auth"
```

---

## Task 8: Admin run API

**Files:**
- Create: `app/api/admin/run/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/admin/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { action: string; secret: string };

  if (!process.env.ADMIN_SECRET || body.secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (body.action !== 'liquidate' && body.action !== 'distribute') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  return new Promise((resolve) => {
    exec(
      `npm run ${body.action}`,
      { cwd: process.cwd(), timeout: 300_000 },
      (error, stdout, stderr) => {
        resolve(NextResponse.json({
          success: !error,
          output: [stdout, stderr].filter(Boolean).join('\n').trim(),
          error: error?.message ?? null,
        }));
      }
    );
  });
}
```

- [ ] **Step 2: Smoke-test manually**

```bash
curl -X POST http://localhost:3001/api/admin/run \
  -H "Content-Type: application/json" \
  -d '{"action":"liquidate","secret":"wrong"}'
```
Expected: `{"error":"Unauthorized"}`

```bash
curl -X POST http://localhost:3001/api/admin/run \
  -H "Content-Type: application/json" \
  -d '{"action":"invalid","secret":"recycler-admin-2026"}'
```
Expected: `{"error":"Invalid action"}`

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/run/route.ts
git commit -m "feat: add /api/admin/run endpoint for liquidate/distribute actions"
```

---

## Task 9: Admin page

**Files:**
- Create: `app/admin/[token]/page.tsx`

- [ ] **Step 1: Create the admin page**

```typescript
// app/admin/[token]/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

type Section = 'overview' | 'vault' | 'actions' | 'smelt' | 'history';

interface VaultToken { mint: string; uiAmount: number; usdValue: number; pctOfThreshold: number; }
interface LiquidationEntry { date: string; mint: string; solReceived: number; distributed: boolean; }
interface DistributionEntry { date: string; totalSol: number; recipientCount: number; txSignatures: string[]; }

interface AdminStats {
  vault: { tokens: VaultToken[]; totalUsd: number };
  smelt: { supply: number; epochRate: number; currentEpoch: number; msUntilHalving: number; nav: number };
  fees: { totalCollected: number; undistributedSol: number; totalAccountsClosed: number };
  liquidations: { recent: LiquidationEntry[]; undistributedSol: number };
  distributions: { recent: DistributionEntry[]; totalSolDistributed: number; lastDistribution: DistributionEntry | null; nextDistributionDate: string | null };
  pending: { totalSol: number };
}

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'vault', label: 'Vault', icon: '🏦' },
  { id: 'actions', label: 'Actions', icon: '⚡' },
  { id: 'smelt', label: 'SMELT', icon: '🪙' },
  { id: 'history', label: 'History', icon: '📜' },
];

function shortAddr(addr: string) { return `${addr.slice(0, 8)}…${addr.slice(-6)}`; }
function formatDate(iso: string) { return new Date(iso).toLocaleString(); }
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Halving now!';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return `${days}d ${hours}h`;
}

export default function AdminPage() {
  const params = useParams();
  const token = params.token as string;

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [actionOutput, setActionOutput] = useState('No output yet.');
  const [actionRunning, setActionRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/stats?secret=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (res.status === 401) { setAuthorized(false); return; }
      if (!res.ok) return;
      setData(await res.json() as AdminStats);
      setAuthorized(true);
      setLastUpdated(new Date());
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(() => refresh(true), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refresh]);

  const runAction = useCallback(async (action: 'liquidate' | 'distribute') => {
    setActionRunning(true);
    setActionOutput(`Running ${action}...\n`);
    setSection('actions');
    try {
      const res = await fetch('/api/admin/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, secret: token }),
      });
      const json = await res.json() as { success: boolean; output: string; error: string | null };
      setActionOutput(json.output || json.error || 'Done (no output).');
      if (json.success) refresh(true);
    } catch (e) {
      setActionOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionRunning(false);
    }
  }, [token, refresh]);

  // Unauthorized
  if (authorized === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#060f0d] text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">404</div>
          <div className="text-zinc-500 text-sm">Page not found</div>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#060f0d] text-white">
        <div className="w-8 h-8 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  const d = data!;

  return (
    <div className="flex h-screen bg-[#060f0d] text-white overflow-hidden">

      {/* Admin sidebar */}
      <aside className="w-36 flex-shrink-0 flex flex-col border-r border-white/5 bg-[#09140f]">
        <div className="px-4 pt-5 pb-4 border-b border-white/5">
          <div className="text-emerald-400 text-xs font-bold tracking-widest uppercase">⚙ Admin</div>
        </div>
        <nav className="flex-1 flex flex-col gap-1 p-2 pt-3">
          {NAV_ITEMS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={[
                'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left w-full',
                section === id
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
              ].join(' ')}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/5 space-y-2">
          {lastUpdated && (
            <div className="text-[10px] text-zinc-600 text-center">
              {lastUpdated.toLocaleTimeString()}
            </div>
          )}
          <button
            onClick={() => refresh()}
            disabled={refreshing}
            className="w-full flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 disabled:opacity-40 transition-all"
          >
            <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
            {refreshing ? '…' : 'Refresh'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* ── OVERVIEW ── */}
        {section === 'overview' && (
          <div className="p-6 space-y-6">
            <h2 className="text-lg font-bold text-zinc-100">Overview</h2>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'SMELT Supply', value: d.smelt.supply.toLocaleString(), sub: `Epoch ${d.smelt.currentEpoch}`, color: 'text-emerald-400' },
                { label: 'Vault Value', value: `$${d.vault.totalUsd.toFixed(2)}`, sub: `${d.vault.tokens.length} token${d.vault.tokens.length !== 1 ? 's' : ''}`, color: 'text-zinc-200' },
                { label: 'Pending SOL', value: d.pending.totalSol.toFixed(6), sub: 'Fees + liquidations', color: 'text-zinc-200' },
                { label: 'NAV / SMELT', value: `${d.smelt.nav.toFixed(6)} SOL`, sub: 'Pending pool ÷ supply', color: 'text-indigo-400' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <div className="text-xs text-zinc-500 mb-1">{label}</div>
                  <div className={`text-xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <div className="text-sm font-semibold text-zinc-200 mb-1">⚡ Liquidate</div>
                <div className="text-xs text-zinc-500 mb-3">
                  Swap vault tokens → SOL when any token exceeds $10 USD value.
                  {d.vault.tokens.some((t) => t.usdValue >= 10) && (
                    <span className="text-emerald-400 font-semibold"> A token is ready!</span>
                  )}
                </div>
                <button
                  onClick={() => runAction('liquidate')}
                  disabled={actionRunning}
                  className="w-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold py-2 rounded-xl hover:bg-emerald-500/25 disabled:opacity-40 transition-all"
                >
                  {actionRunning ? 'Running…' : '▶ Run Liquidation'}
                </button>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <div className="text-sm font-semibold text-zinc-200 mb-1">💸 Distribute</div>
                <div className="text-xs text-zinc-500 mb-3">
                  Send {d.pending.totalSol.toFixed(6)} SOL to all SMELT holders (1× held, 1.5× staked).
                </div>
                <button
                  onClick={() => runAction('distribute')}
                  disabled={actionRunning || d.pending.totalSol === 0}
                  className="w-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold py-2 rounded-xl hover:bg-blue-500/25 disabled:opacity-40 transition-all"
                >
                  {actionRunning ? 'Running…' : '▶ Run Distribution'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── VAULT ── */}
        {section === 'vault' && (
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-100">Vault Contents</h2>
            {d.vault.tokens.length === 0 ? (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-zinc-500 text-sm">
                Vault is empty — no tokens accumulated yet.
              </div>
            ) : (
              <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-500 text-xs">
                      <th className="text-left px-4 py-3">Token</th>
                      <th className="text-right px-4 py-3">Balance</th>
                      <th className="text-right px-4 py-3">USD Value</th>
                      <th className="px-4 py-3 w-44">Progress to $10</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.vault.tokens.map((t) => (
                      <tr key={t.mint} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-3 font-mono text-zinc-300 text-xs">{shortAddr(t.mint)}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{t.uiAmount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">
                          ${t.usdValue.toFixed(2)}
                          {t.usdValue >= 10 && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">READY</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${t.pctOfThreshold}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-500 mt-1 block text-right">
                            {t.pctOfThreshold.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIONS ── */}
        {section === 'actions' && (
          <div className="p-6 space-y-6">
            <h2 className="text-lg font-bold text-zinc-100">Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-3">
                <div className="text-sm font-semibold text-zinc-200">⚡ Liquidation</div>
                <div className="text-xs text-zinc-400 leading-relaxed">
                  Scans the Vault for tokens with USD value over $10. For each one, swaps the full
                  balance to SOL via Jupiter and logs the result to <code className="text-zinc-300">data/liquidations.json</code>.
                </div>
                <button
                  onClick={() => runAction('liquidate')}
                  disabled={actionRunning}
                  className="w-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold py-2.5 rounded-xl hover:bg-emerald-500/25 disabled:opacity-40 transition-all"
                >
                  {actionRunning ? '⏳ Running…' : '▶ Run Liquidation'}
                </button>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-3">
                <div className="text-sm font-semibold text-zinc-200">💸 Distribution</div>
                <div className="text-xs text-zinc-400 leading-relaxed">
                  Fetches all SMELT holders on-chain. Calculates each wallet&apos;s share
                  (1× unstaked, 1.5× staked). Sends SOL in batches of 20 per transaction.
                  Logs results to <code className="text-zinc-300">data/distributions.json</code>.
                </div>
                <button
                  onClick={() => runAction('distribute')}
                  disabled={actionRunning || d.pending.totalSol === 0}
                  className="w-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold py-2.5 rounded-xl hover:bg-blue-500/25 disabled:opacity-40 transition-all"
                >
                  {actionRunning ? '⏳ Running…' : '▶ Run Distribution'}
                </button>
                {d.pending.totalSol === 0 && (
                  <p className="text-xs text-zinc-600">No pending SOL to distribute.</p>
                )}
              </div>
            </div>

            {/* Terminal output */}
            <div className="rounded-2xl bg-zinc-950 border border-white/10 overflow-hidden">
              <div className="px-4 py-2 border-b border-white/10 text-xs text-zinc-500 font-mono">
                Output {actionRunning && <span className="text-emerald-400 animate-pulse">● running</span>}
              </div>
              <pre className="p-4 text-xs text-zinc-300 font-mono whitespace-pre-wrap overflow-auto max-h-80">
                {actionOutput}
              </pre>
            </div>
          </div>
        )}

        {/* ── SMELT ── */}
        {section === 'smelt' && (
          <div className="p-6 space-y-6">
            <h2 className="text-lg font-bold text-zinc-100">SMELT Token</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Circulating Supply', value: d.smelt.supply.toLocaleString() + ' SMELT', color: 'text-emerald-400' },
                { label: 'Current Epoch', value: `#${d.smelt.currentEpoch}`, color: 'text-zinc-200' },
                { label: 'Emission Rate', value: `${d.smelt.epochRate} SMELT / account`, color: 'text-zinc-200' },
                { label: 'Next Halving', value: formatCountdown(d.smelt.msUntilHalving), color: 'text-amber-400' },
                { label: 'NAV', value: `${d.smelt.nav.toFixed(6)} SOL / SMELT`, color: 'text-indigo-400' },
                { label: 'Pending Pool', value: `${d.pending.totalSol.toFixed(6)} SOL`, color: 'text-zinc-200' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <div className="text-xs text-zinc-500 mb-1">{label}</div>
                  <div className={`text-lg font-bold ${color}`}>{value}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-xs text-zinc-400 leading-relaxed">
              <strong className="text-zinc-300">NAV explained:</strong> The Net Asset Value is the pending SOL pool
              divided by circulating supply. It represents what each SMELT token is currently worth if all
              pending SOL were distributed today. NAV grows as more accounts are recycled and vault tokens are liquidated.
            </div>
          </div>
        )}

        {/* ── HISTORY ── */}
        {section === 'history' && (
          <div className="p-6 space-y-8">
            <h2 className="text-lg font-bold text-zinc-100">History</h2>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-300">Recent Liquidations</h3>
              {d.liquidations.recent.length === 0 ? (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-zinc-500 text-sm">No liquidations yet.</div>
              ) : (
                <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-500 text-xs">
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">Token</th>
                        <th className="text-right px-4 py-3">SOL Received</th>
                        <th className="text-center px-4 py-3">Distributed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.liquidations.recent.map((l, i) => (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-3 text-zinc-400 text-xs">{formatDate(l.date)}</td>
                          <td className="px-4 py-3 font-mono text-zinc-300 text-xs">{shortAddr(l.mint)}</td>
                          <td className="px-4 py-3 text-right text-emerald-400">{l.solReceived.toFixed(6)}</td>
                          <td className="px-4 py-3 text-center">{l.distributed ? '✓' : '·'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-300">Recent Distributions</h3>
              {d.distributions.recent.length === 0 ? (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-zinc-500 text-sm">No distributions yet.</div>
              ) : (
                <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-500 text-xs">
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-right px-4 py-3">SOL Sent</th>
                        <th className="text-right px-4 py-3">Recipients</th>
                        <th className="text-right px-4 py-3">Txs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.distributions.recent.map((dist, i) => (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-3 text-zinc-400 text-xs">{formatDate(dist.date)}</td>
                          <td className="px-4 py-3 text-right text-emerald-400">{dist.totalSol.toFixed(6)}</td>
                          <td className="px-4 py-3 text-right text-zinc-300">{dist.recipientCount}</td>
                          <td className="px-4 py-3 text-right text-zinc-500 text-xs">{dist.txSignatures.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

      </main>
    </div>
  );
}
```

- [ ] **Step 2: Run the build**

```
npm run build
```
Expected: `/admin/[token]` appears as a dynamic route.

- [ ] **Step 3: Smoke-test in browser**

Navigate to `http://localhost:3001/admin/recycler-admin-2026`
Expected: Admin dashboard loads with Overview section showing stat cards.

Navigate to `http://localhost:3001/admin/wrong-secret`
Expected: 404 page displayed.

- [ ] **Step 4: Commit**

```bash
git add app/admin/[token]/page.tsx
git commit -m "feat: add admin dashboard at /admin/[token] with sidebar, stats, and action terminal"
```

---

## Task 10: Environment file + cleanup

**Files:**
- Create: `.env.local`
- Delete: `components/Nav.tsx`

- [ ] **Step 1: Create .env.local**

```bash
# .env.local
ADMIN_SECRET=recycler-admin-2026
```

(Create this file. It is already gitignored by Next.js defaults.)

- [ ] **Step 2: Delete Nav.tsx**

```bash
git rm components/Nav.tsx
```

- [ ] **Step 3: Run full test suite**

```
npm test
```
Expected: All existing tests pass (the `smelt-context` and `AppShell` mocks added in earlier tasks cover new dependencies).

- [ ] **Step 4: Run the build one final time**

```
npm run build
```
Expected: Clean build, no TypeScript errors, all routes listed.

- [ ] **Step 5: Final commit**

```bash
git add .env.local
git commit -m "feat: complete admin UI + app shell redesign — unified sidebar, How it Works, admin dashboard"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Unified sidebar shell → AppShell (Task 2, 3)
- ✅ SmeltContext for shared balance + refresh → Task 1
- ✅ Recycle page: remove sidebar, add stats strip → Task 4
- ✅ Pools page: remove full-page wrapper → Task 5
- ✅ How it Works page → Task 6
- ✅ Admin stats API with auth → Task 7
- ✅ Admin run API for liquidate/distribute → Task 8
- ✅ Admin page: sidebar nav, 5 sections, action terminal → Task 9
- ✅ Hidden URL auth (token param vs ADMIN_SECRET) → Tasks 7–9
- ✅ NAV = pendingSol / totalSupply shown in sidebar + admin SMELT tab → Tasks 2, 9
- ✅ Halving countdown → Task 9 (SMELT section)
- ✅ Nav.tsx deleted → Task 10
- ✅ .env.local created → Task 10

**Placeholder scan:** No TBDs, TODOs, or vague steps found.

**Type consistency:** `VaultToken`, `LiquidationEntry`, `DistributionEntry`, `FeeEntry`, `AdminStats` — all defined locally in the files that use them. No cross-file type sharing that could drift.
