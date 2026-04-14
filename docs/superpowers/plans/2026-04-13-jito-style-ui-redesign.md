# Jito-Style UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark-teal theme with a bright Jito-style light theme: white cards, gray-50 page background, bold dark text, emerald green accent, and a sticky top nav bar replacing the sidebar.

**Architecture:** `components/AppShell.tsx` is fully rewritten from a sidebar layout to a sticky top nav + stats bar + mobile hamburger drawer. Each page file is reskinned in place — dark Tailwind classes (`zinc-*`, `white/*`, `bg-[#060f0d]`, `emerald-500/*`) are swapped for light equivalents (`gray-*`, `green-600`, `bg-white`, `border-gray-200`). No new files, no API changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS (default palette only — no custom config needed).

---

## File Map

**Modify only:**
- `app/globals.css` — add `body` base styles for light theme
- `components/AppShell.tsx` — full rewrite: sidebar → top nav + mobile drawer
- `app/page.tsx` — reskin recycle page to light theme
- `app/swap/page.tsx` — reskin swap page to light theme
- `app/community/page.tsx` — reskin community page to light theme
- `app/dashboard/page.tsx` — reskin dashboard page to light theme
- `app/pools/page.tsx` — reskin pools page to light theme
- `app/how-it-works/page.tsx` — reskin how-it-works page to light theme

---

## Task 1: globals.css + AppShell rewrite

**Files:**
- Modify: `app/globals.css`
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Update app/globals.css**

Replace entire file:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: #f9fafb;
  color: #111827;
}
```

- [ ] **Step 2: Replace components/AppShell.tsx**

Replace entire file with:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSmelt } from '@/lib/smelt-context';
import { Connection } from '@solana/web3.js';
import { SMELT_MINT } from '@/lib/constants';

const NAV_ITEMS = [
  { href: '/', label: 'Recycle', icon: '♻' },
  { href: '/swap', label: 'Swap', icon: '⇄' },
  { href: '/community', label: 'Community', icon: '🌍' },
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingSol, setPendingSol] = useState(0);
  const [totalSupply, setTotalSupply] = useState(0);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

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
    try {
      (connection as Connection).getTokenSupply(SMELT_MINT)
        .then((s) => setTotalSupply(s.value.uiAmount ?? 0))
        .catch(() => {});
    } catch { /* tests */ }
  }, [connection]);

  const nav = totalSupply > 0 && pendingSol > 0
    ? (pendingSol / totalSupply).toFixed(6)
    : '0.000000';

  if (pathname.startsWith('/admin')) {
    return (
      <div className="h-screen bg-[#060f0d] text-white overflow-hidden">
        {children}
      </div>
    );
  }

  const allNavItems = [
    ...NAV_ITEMS,
    ...(connected && publicKey ? [{ href: '/dashboard', label: 'Dashboard', icon: '👤' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      {mounted && (
        <div
          className="fixed top-0 left-0 bottom-0 z-50 w-72 bg-white border-r border-gray-200 flex flex-col md:hidden"
          style={{ transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.25s ease' }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-base">♻</div>
              <span className="font-extrabold text-gray-900">Recycler</span>
            </div>
            <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1" aria-label="Close menu">✕</button>
          </div>
          <nav className="flex-1 p-3 flex flex-col gap-1">
            {allNavItems.map(({ href, label, icon }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    active ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  ].join(' ')}
                >
                  <span>{icon}</span><span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-gray-100">
            {connected && publicKey ? (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-3 space-y-1.5">
                  <div className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">Wallet</div>
                  <div className="text-gray-700 text-xs font-mono">{shortAddr(publicKey.toBase58())}</div>
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-gray-400">SMELT</span>
                    <span className="text-gray-700 font-semibold">{(Number(smeltBalance) / 1e9).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">NAV</span>
                    <span className="text-indigo-500 font-semibold">{nav} SOL</span>
                  </div>
                </div>
                <button onClick={() => disconnect()} className="w-full text-gray-400 text-xs rounded-xl py-2.5 border border-gray-200 hover:border-gray-300 hover:text-gray-600 transition-all">Disconnect</button>
              </>
            ) : mounted ? (
              <WalletMultiButton className="!w-full !bg-green-600 !text-white !font-semibold !text-sm !rounded-xl !justify-center !py-2.5" />
            ) : (
              <div className="h-10 w-full rounded-xl bg-green-100 animate-pulse" />
            )}
          </div>
        </div>
      )}

      {/* TOP NAV */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-14 flex items-center px-4 sm:px-6">
        <div className="flex items-center gap-3 md:hidden">
          <button onClick={() => setDrawerOpen(true)} className="text-gray-500 hover:text-gray-800 text-xl leading-none p-1" aria-label="Open menu">☰</button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-green-600 flex items-center justify-center text-white text-sm">♻</div>
            <span className="font-extrabold text-gray-900 text-sm">Recycler</span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-8 flex-1">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold">♻</div>
            <span className="font-extrabold text-gray-900 text-base tracking-tight">Recycler</span>
          </Link>
          <nav className="flex items-center gap-1">
            {allNavItems.map(({ href, label }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    active ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                  ].join(' ')}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {mounted && connected && publicKey && (
            <span className="hidden sm:inline text-xs font-mono bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full">
              {shortAddr(publicKey.toBase58())}
            </span>
          )}
          {mounted ? (
            connected ? (
              <button onClick={() => disconnect()} className="bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-4 py-2 rounded-full transition-colors">
                Connected ✓
              </button>
            ) : (
              <WalletMultiButton className="!bg-green-600 !text-white !font-bold !text-sm !rounded-full !px-4 !py-2 !h-auto" />
            )
          ) : (
            <div className="w-28 h-8 rounded-full bg-green-100 animate-pulse" />
          )}
        </div>
      </header>

      {/* STATS BAR */}
      <div className="bg-gray-100 border-b border-gray-200 px-4 sm:px-6 py-2 overflow-x-auto">
        <div className="flex items-center gap-4 sm:gap-6 whitespace-nowrap text-xs min-w-max">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 font-medium">NAV</span>
            <span className="text-gray-800 font-bold">{nav} SOL</span>
          </div>
          <span className="text-gray-300 hidden sm:inline">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 font-medium">Supply</span>
            <span className="text-gray-800 font-bold">{totalSupply > 0 ? `${(totalSupply / 1e6).toFixed(2)}M` : '—'} SMELT</span>
          </div>
          <span className="text-gray-300 hidden sm:inline">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 font-medium">Pool</span>
            <span className="text-gray-800 font-bold">{pendingSol > 0 ? `${pendingSol.toFixed(4)}` : '—'} SOL</span>
          </div>
          <span className="text-gray-300 hidden sm:inline">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 font-medium">Emission</span>
            <span className="text-gray-800 font-bold">250 SMELT/account</span>
          </div>
        </div>
      </div>

      {/* PAGE CONTENT */}
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
cd /c/recycle && npm test 2>&1 | tail -15
```
Expected: all passing (AppShell test may need updating if it queries by sidebar-specific text — see note below).

If `components/__tests__/AppShell.test.tsx` fails because it queries for sidebar-specific DOM nodes, update the test to query by nav link text (`getByRole('link', { name: /recycle/i })`), which is present in both old and new layout.

- [ ] **Step 5: Commit**

```bash
cd /c/recycle && git add app/globals.css components/AppShell.tsx && git commit -m "feat: replace sidebar with Jito-style top nav + mobile drawer"
```

---

## Task 2: Recycle page reskin

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace app/page.tsx**

Replace entire file:

```tsx
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
        const referredBy = typeof window !== 'undefined' ? localStorage.getItem('referredBy') ?? undefined : undefined;
        fetch('/api/recycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: publicKey.toBase58(), accountsClosed: result.succeeded, referredBy }),
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

      {/* Stats strip */}
      {status === 'results' && (
        <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
            <div className="text-[9px] font-semibold tracking-widest text-green-600/60 uppercase mb-0.5">SOL to reclaim</div>
            <div className="text-gray-900 font-bold text-lg tracking-tight">{sol.toFixed(4)}</div>
            <div className="text-gray-400 text-[10px] mt-0.5">{selected.length}/{accounts.length} selected</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <div className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">SMELT reward</div>
            <div className="text-green-600 font-bold text-lg">+{smeltReward.toLocaleString()}</div>
            {totalUsd > 0 && <div className="text-gray-400 text-[10px] mt-0.5">dust ${totalUsd.toFixed(2)}</div>}
          </div>
        </div>
      )}

      {/* Disconnected */}
      {status === 'disconnected' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 sm:p-10">
          <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center text-3xl">🔌</div>
          <div className="text-center">
            <div className="text-gray-900 font-semibold text-lg">Connect your wallet</div>
            <div className="text-gray-400 text-sm mt-1.5 max-w-xs">Connect Phantom to scan for dust token accounts and reclaim rent SOL</div>
          </div>
          {mounted && (
            <WalletMultiButton className="!bg-green-600 !text-white !font-semibold !text-sm !rounded-xl !px-6 !py-2.5" />
          )}
        </div>
      )}

      {/* Scanning */}
      {status === 'scanning' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-2 border-gray-200 border-t-green-600 rounded-full animate-spin" />
          <div className="text-center">
            <div className="text-gray-900 font-semibold">Scanning accounts…</div>
            <div className="text-gray-400 text-sm mt-1">Fetching prices from Jupiter</div>
          </div>
        </div>
      )}

      {/* Results */}
      {status === 'results' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <span className="text-gray-400 text-xs font-semibold tracking-widest uppercase">
              {accounts.length} trash account{accounts.length !== 1 ? 's' : ''}
            </span>
            <button onClick={toggleAll} className="text-gray-400 text-xs hover:text-green-600 transition-colors">
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {error && (
            <div className="mx-6 mt-4 flex-shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm">{error}</div>
          )}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-2">
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
                      ? 'border-green-200 bg-green-50 hover:bg-green-50/70'
                      : 'border-gray-100 bg-white opacity-50 hover:opacity-70'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>{initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-gray-900 text-sm font-semibold truncate">{name}</span>
                      {meta?.symbol && <span className="text-gray-400 text-xs flex-shrink-0 font-mono">{meta.symbol}</span>}
                    </div>
                    <div className="text-gray-300 text-[11px] font-mono mt-0.5">{shortAddr(mintStr)}</div>
                  </div>
                  <div className="text-right flex-shrink-0 mr-2">
                    {account.balance === 0 ? (
                      <div className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 tracking-wide">EMPTY</div>
                    ) : (
                      <>
                        <div className="text-gray-700 text-sm font-semibold tabular-nums">{account.usdValue > 0.0001 ? `$${account.usdValue.toFixed(4)}` : '<$0.01'}</div>
                        <div className="text-gray-400 text-[11px] mt-0.5 tabular-nums">{account.balance.toLocaleString()} tkn</div>
                      </>
                    )}
                  </div>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(key)} onClick={(e) => e.stopPropagation()} className="accent-green-600 w-4 h-4 flex-shrink-0 cursor-pointer" />
                </div>
              );
            })}
          </div>
          <div className="px-4 sm:px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
            <button
              onClick={recycle}
              disabled={!signAllTransactions || selected.length === 0}
              className="w-full bg-green-600 hover:bg-green-500 active:scale-[0.99] disabled:opacity-25 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all text-sm"
            >
              ♻ Recycle {selected.length} account{selected.length !== 1 ? 's' : ''} · reclaim {sol.toFixed(4)} SOL
            </button>
          </div>
        </div>
      )}

      {/* Recycling */}
      {status === 'recycling' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-2 border-gray-200 border-t-green-600 rounded-full animate-spin" />
          <div className="text-center">
            <div className="text-gray-900 font-semibold">Recycling {selected.length} account{selected.length !== 1 ? 's' : ''}…</div>
            <div className="text-gray-400 text-sm mt-1">Approve in Phantom, then wait for confirmation</div>
          </div>
        </div>
      )}

      {/* Success */}
      {status === 'success' && recycleResult && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center text-3xl">✅</div>
          <div className="text-center">
            <div className="text-gray-900 font-bold text-2xl tracking-tight">~{recycleResult.solReclaimed.toFixed(4)} SOL</div>
            <div className="text-gray-400 text-sm mt-1.5">reclaimed from {recycleResult.succeeded} account{recycleResult.succeeded !== 1 ? 's' : ''}</div>
            {recycleResult.failed > 0 && <div className="text-amber-500 text-sm mt-1">{recycleResult.failed} failed</div>}
          </div>
          <button onClick={scan} className="border border-gray-200 text-gray-400 text-sm rounded-xl px-5 py-2.5 hover:border-gray-300 hover:text-gray-600 transition-all">Scan again</button>
        </div>
      )}

      {/* Empty */}
      {status === 'empty' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center text-3xl">✅</div>
          <div className="text-center">
            <div className="text-gray-900 font-semibold text-lg">Nothing to recycle</div>
            <div className="text-gray-400 text-sm mt-1">Your wallet is clean.</div>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-5 sm:p-8">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 max-w-sm w-full text-center">
            <div className="text-red-600 font-semibold mb-1">Scan failed</div>
            <div className="text-red-400 text-sm">{error}</div>
          </div>
          <button onClick={scan} className="border border-gray-200 text-gray-400 text-sm rounded-xl px-5 py-2.5 hover:border-gray-300 hover:text-gray-600 transition-all">Try again</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/recycle && git add app/page.tsx && git commit -m "feat: reskin recycle page to light theme"
```

---

## Task 3: Swap page reskin

**Files:**
- Modify: `app/swap/page.tsx`

- [ ] **Step 1: Replace dark classes in app/swap/page.tsx**

Apply these replacements throughout the file:

| Old | New |
|---|---|
| `bg-white/5` | `bg-white` |
| `bg-white/\[0.02\]` | `bg-white` |
| `border-white/5` | `border-gray-100` |
| `border-white/10` | `border-gray-200` |
| `text-zinc-100` | `text-gray-900` |
| `text-zinc-200` | `text-gray-800` |
| `text-zinc-300` | `text-gray-700` |
| `text-zinc-400` | `text-gray-500` |
| `text-zinc-500` | `text-gray-400` |
| `text-zinc-600` | `text-gray-400` |
| `text-zinc-700` | `text-gray-300` |
| `text-white` | `text-gray-900` |
| `text-white/` (any) | `text-gray-900` |
| `text-emerald-400` | `text-green-600` |
| `text-emerald-500` | `text-green-600` |
| `bg-emerald-500` | `bg-green-600` |
| `hover:bg-emerald-400` | `hover:bg-green-500` |
| `bg-emerald-500/15` | `bg-green-50` |
| `bg-emerald-500/10` | `bg-green-50` |
| `border-emerald-500/15` | `border-green-200` |
| `border-emerald-500/20` | `border-green-200` |
| `text-emerald-400/70` | `text-green-600/70` |
| `border-t-emerald-400` | `border-t-green-600` |
| `border-emerald-900` | `border-gray-200` |
| `bg-black/60` | `bg-black/40` |
| `animate-pulse` skeleton `bg-white/5` | `bg-gray-200` |
| `text-red-400` | `text-red-600` |
| `text-red-400/50` | `text-red-400` |
| `border-red-500/20` | `border-red-200` |
| `bg-red-500/5` | `bg-red-50` |
| `text-amber-400` | `text-amber-600` |

Also replace the page's outer `<main>` background if it has a dark one — set it to nothing (inherits `bg-gray-50` from AppShell).

After applying changes, verify the file looks correct by reading it.

- [ ] **Step 2: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/recycle && git add app/swap/page.tsx && git commit -m "feat: reskin swap page to light theme"
```

---

## Task 4: Community page reskin

**Files:**
- Modify: `app/community/page.tsx`

- [ ] **Step 1: Replace entire app/community/page.tsx**

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
            <div key={i} className="h-24 rounded-2xl bg-gray-200 animate-pulse" />
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
            <h2 className="text-lg font-bold text-gray-900">🌍 Ecosystem Health</h2>
            <span className="text-xs text-gray-400">All-time · Solana-wide</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Wallets cleaned', value: (eco?.totalWallets ?? 0).toLocaleString(), color: 'text-green-600' },
              { label: 'Accounts closed', value: (eco?.totalAccountsClosed ?? 0).toLocaleString(), color: 'text-gray-900' },
              { label: 'SOL unlocked', value: `${(eco?.totalSolReclaimed ?? 0).toFixed(2)} SOL`, color: 'text-indigo-500', sub: 'returned to users' },
              { label: 'SMELT minted', value: (eco?.totalSmeltMinted ?? 0).toLocaleString(), color: 'text-gray-900', sub: 'earned by recyclers' },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="rounded-2xl bg-white border border-gray-200 p-4">
                <div className="text-xs text-gray-400 mb-1">{label}</div>
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* Leaderboard */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">🏆 Leaderboard</h2>
            {tab === 'weekly' && lb?.weekly.since && (
              <span className="text-xs text-gray-400">
                Since {new Date(lb.weekly.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-4 w-fit">
            {(['weekly', 'allTime'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab === t ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {t === 'weekly' ? 'This week' : 'All-time'}
              </button>
            ))}
          </div>

          {currentEntries.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-6 text-gray-400 text-sm">
              No recycling activity yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-xs">
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
                      <tr key={entry.wallet} className={`border-b border-gray-50 last:border-0 ${isUser ? 'bg-green-50' : ''}`}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{medal ?? i + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                          {shortAddr(entry.wallet)}
                          {isUser && <span className="ml-2 text-green-700 text-[10px] font-semibold bg-green-100 px-1.5 py-0.5 rounded">you</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 font-semibold">{entry.accounts}</td>
                        <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">{entry.solReclaimed.toFixed(4)}</td>
                        {tab === 'weekly' && (
                          <td className="px-4 py-3 text-right hidden sm:table-cell">
                            {PRIZES[i] ? (
                              <span className="text-xs text-green-600 font-semibold">+{PRIZES[i]} SMELT</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {userRank === -1 && userWallet && (
                <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between text-xs bg-green-50">
                  <span className="text-gray-400">Your rank: not in top 20</span>
                  <span className="text-gray-500 font-mono">{shortAddr(userWallet)}</span>
                  <span className="text-green-700 text-[10px] bg-green-100 px-1.5 py-0.5 rounded font-semibold">you</span>
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
cd /c/recycle && npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
cd /c/recycle && git add app/community/page.tsx && git commit -m "feat: reskin community page to light theme"
```

---

## Task 5: Dashboard page reskin

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Replace entire app/dashboard/page.tsx**

```tsx
// app/dashboard/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSmelt } from '@/lib/smelt-context';
import { fetchStakeInfo } from '@/lib/smelt';

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
        <div className="text-gray-900 font-semibold">Connect your wallet to view your dashboard</div>
        <WalletMultiButton className="!bg-green-600 !text-white !font-semibold !text-sm !rounded-xl !px-6 !py-2.5" />
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <div className="text-gray-400 text-xs mt-1 font-mono">{shortAddr(publicKey.toBase58())}</div>
        </div>

        {/* Portfolio */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Portfolio</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'SMELT Balance', value: smeltUi.toLocaleString(), sub: 'total holdings', color: 'text-green-600' },
              { label: 'Staked', value: stakedUi.toLocaleString(), sub: '1.5× weight active', color: 'text-gray-900', badge: stakedUi > 0 },
              { label: 'Distribution weight', value: weight.toLocaleString(undefined, { maximumFractionDigits: 0 }), sub: `${unstakedUi.toFixed(0)} × 1 + ${stakedUi.toFixed(0)} × 1.5`, color: 'text-indigo-500' },
              { label: 'SOL reclaimed', value: `${(data?.activity.allTimeSolReclaimed ?? 0).toFixed(4)} SOL`, sub: 'all-time from recycling', color: 'text-gray-900' },
            ].map(({ label, value, sub, color, badge }) => (
              <div key={label} className="rounded-2xl bg-white border border-gray-200 p-4">
                <div className="text-xs text-gray-400 mb-1">{label}</div>
                <div className={`text-lg font-bold ${color} flex items-center gap-1.5`}>
                  {value}
                  {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">1.5×</span>}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Activity */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Activity</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Accounts closed (all-time)', value: (data?.activity.allTimeAccounts ?? 0).toLocaleString() },
              { label: 'SOL reclaimed (all-time)', value: `${(data?.activity.allTimeSolReclaimed ?? 0).toFixed(4)} SOL` },
              { label: 'SMELT earned recycling', value: (data?.activity.allTimeSmeltEarned ?? 0).toLocaleString() },
              { label: 'Accounts this week', value: (data?.activity.weeklyAccounts ?? 0).toLocaleString() },
              { label: 'Weekly rank', value: data?.activity.weeklyRank ? `#${data.activity.weeklyRank}` : '—' },
              { label: 'Referrals', value: (data?.referral.count ?? 0).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl bg-white border border-gray-200 px-4 py-3">
                <div className="text-xs text-gray-400 mb-1">{label}</div>
                <div className="text-gray-900 font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Referrals */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Referrals</h2>
          <div className="rounded-2xl bg-white border border-gray-200 p-5 space-y-4">
            <div>
              <div className="text-xs text-gray-400 mb-2">Your referral link</div>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 font-mono truncate">
                  {referralLink}
                </div>
                <button
                  onClick={copyLink}
                  className="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all flex-shrink-0"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={shareLink}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all flex-shrink-0"
                  >
                    Share
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-400 mb-1">Pending bonus</div>
                <div className="text-green-600 font-semibold">{(data?.referral.pendingBonus ?? 0).toFixed(6)} SOL</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Total earned</div>
                <div className="text-gray-900 font-semibold">{(data?.referral.totalEarned ?? 0).toFixed(6)} SOL</div>
              </div>
            </div>

            {(data?.referral.referrals.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-gray-300">Recent referrals</div>
                {data!.referral.referrals.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-mono">{shortAddr(r.referee)}</span>
                    <span className="text-gray-400">{r.accountsClosed} accounts</span>
                    <span className="text-green-600">+{r.bonusEarned.toFixed(6)} SOL</span>
                    <span className="text-gray-400">{formatDate(r.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Rewards */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Rewards</h2>
          <div className="rounded-2xl bg-white border border-gray-200 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-400 mb-1">Next distribution</div>
                <div className="text-gray-900 font-semibold">
                  {data?.distributions.nextDistributionDate
                    ? formatDate(data.distributions.nextDistributionDate)
                    : 'Not scheduled'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Your weight</div>
                <div className="text-gray-900 font-semibold">
                  {weight.toLocaleString(undefined, { maximumFractionDigits: 0 })} units
                </div>
              </div>
            </div>

            {(data?.distributions.recent.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-300">Recent distributions (platform-wide)</div>
                {data!.distributions.recent.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-gray-500">{formatDate(d.date)}</span>
                    <span className="text-green-600 font-semibold">{d.totalSol.toFixed(6)} SOL</span>
                    <span className="text-gray-400">{d.recipientCount} recipients</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-400 text-sm">No distributions yet.</div>
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
cd /c/recycle && npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
cd /c/recycle && git add app/dashboard/page.tsx && git commit -m "feat: reskin dashboard page to light theme"
```

---

## Task 6: Pools page reskin

**Files:**
- Modify: `app/pools/page.tsx`

- [ ] **Step 1: Apply light-theme replacements to app/pools/page.tsx**

Make these targeted replacements (use the same mapping table from Task 3):

1. Loading skeleton: `bg-white/5` → `bg-gray-200`
2. Page header: `text-zinc-100` → `text-gray-900`, `text-zinc-600` → `text-gray-400`
3. Refresh button: `border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20` → `border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300`
4. Section headings: `text-zinc-200` → `text-gray-800`
5. All cards: `bg-white/5 border-white/10` → `bg-white border-gray-200`
6. Card label text: `text-zinc-500` → `text-gray-400`
7. Card value text: `text-zinc-200` → `text-gray-800`, `text-zinc-300` → `text-gray-700`
8. Table container: `bg-white/5 border-white/10` → `bg-white border-gray-200`
9. Table headers: `text-zinc-500` → `text-gray-400`, `border-white/10` → `border-gray-100`
10. Table rows: `border-white/5` → `border-gray-50`, `text-zinc-300` → `text-gray-700`, `text-zinc-400` → `text-gray-500`
11. Progress bar track: `bg-white/10` → `bg-gray-200`, fill `bg-emerald-500` → `bg-green-600`
12. Progress text: `text-zinc-500` → `text-gray-400`
13. Empty state: `bg-white/5 border-white/10 text-zinc-500` → `bg-white border-gray-200 text-gray-400`
14. Positive values: `text-emerald-400` → `text-green-600`
15. Staked badge: `bg-emerald-500/20 text-emerald-400` → `bg-green-100 text-green-700`

After applying, read the file to verify no dark classes remain.

- [ ] **Step 2: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
cd /c/recycle && git add app/pools/page.tsx && git commit -m "feat: reskin pools page to light theme"
```

---

## Task 7: How it works reskin

**Files:**
- Modify: `app/how-it-works/page.tsx`

- [ ] **Step 1: Replace entire app/how-it-works/page.tsx**

```tsx
// app/how-it-works/page.tsx
export default function HowItWorksPage() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">

        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">How it works</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Recycler helps you clean up your Solana wallet and reclaim locked SOL — with a small
            reward token (SMELT) for every account you close.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">What is dust?</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Every SPL token account on Solana requires a minimum balance of ~<strong className="text-gray-700">0.002 SOL</strong> to
            exist — this is called <em>rent exemption</em>. Over time, wallets accumulate dozens of
            accounts holding tiny or zero balances from old airdrops, failed trades, or forgotten
            positions. These accounts lock up your SOL even though the tokens inside are worth
            almost nothing.
          </p>
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500">
            A wallet with <strong className="text-gray-700">20 dust accounts</strong> has{' '}
            <strong className="text-gray-700">~0.04 SOL</strong> locked up — about{' '}
            <strong className="text-gray-700">$6–8</strong> at current prices.
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">How recycling works</h2>
          <ol className="space-y-2 text-sm text-gray-500">
            {([\
              ['Scan', 'Connect your wallet. Recycler checks all your token accounts and flags any with a USD value under $0.10 as recyclable.'],
              ['Select', 'Review the list. Deselect any accounts you want to keep. You are always in control.'],
              ['Approve', 'Click Recycle. One transaction is sent to Phantom for your approval — no repeated popups.'],
              ['Reclaim', 'For each closed account, Solana returns ~0.002 SOL to your wallet. Recycler keeps a 5% platform fee.'],
              ['Earn SMELT', 'After closing, the platform mints SMELT tokens to your wallet as a reward.'],
            ] as [string, string][]).map(([title, desc], i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span><strong className="text-gray-700">{title}:</strong> {desc}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">What is SMELT?</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            SMELT is the platform reward token. You earn it every time you recycle accounts. The
            emission rate starts at <strong className="text-gray-700">250 SMELT per account</strong> and
            halves every 6 months — similar to Bitcoin&apos;s halving schedule.
          </p>
          <p className="text-gray-500 text-sm leading-relaxed">
            SMELT holders receive a proportional share of the platform&apos;s accumulated SOL (from
            liquidations and recycling fees) in regular distributions. The{' '}
            <strong className="text-gray-700">NAV</strong> (Net Asset Value) shown in the nav bar is
            the current SOL value of the pending pool divided by total circulating supply — it tells
            you exactly what each SMELT token is worth right now.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">The Vault</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            When you recycle, your dust tokens are transferred to the platform Vault before the
            account is closed. The Vault accumulates tokens over time. When any single token&apos;s
            balance exceeds <strong className="text-gray-700">$10 USD</strong>, it is automatically
            swapped to SOL via Jupiter (best-price DEX routing on Solana) and added to the
            distribution pool.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Distributions</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Accumulated SOL — from vault liquidations and the 5% recycling fee — is distributed
            weekly to all SMELT token holders. Your share is proportional to your holdings.
            Staked SMELT earns a <strong className="text-gray-700">1.5× weight boost</strong>.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">FAQ</h2>
          {([\
            ['Is it safe?', 'Yes. Every transaction is shown in Phantom for your approval before anything happens on-chain. The platform never has custody of your SOL.'],
            ["What's the 5% fee for?", 'It covers platform operating costs and flows into the SMELT distribution pool, so SMELT holders benefit directly from recycling activity.'],
            ['Why Jupiter?', 'Jupiter aggregates all major Solana DEXes to find the best swap price for vault tokens. This maximises SOL returned to the distribution pool.'],
            ['Can I lose tokens?', 'Only tokens you explicitly select are recycled. Tokens worth more than $0.10 are never shown as recyclable — only true dust and empty accounts appear.'],
            ['When are distributions?', 'Approximately weekly. You can see the next scheduled date in the Pools page.'],
          ] as [string, string][]).map(([q, a]) => (
            <div key={q} className="rounded-xl bg-white border border-gray-200 px-4 py-3">
              <div className="text-gray-800 text-sm font-medium mb-1">{q}</div>
              <div className="text-gray-500 text-sm leading-relaxed">{a}</div>
            </div>
          ))}
        </section>

      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 3: Run full test suite**

```bash
cd /c/recycle && npm test 2>&1 | tail -15
```
Expected: all 20 tests passing.

- [ ] **Step 4: Build check**

```bash
cd /c/recycle && npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully`, all routes listed.

- [ ] **Step 5: Commit**

```bash
cd /c/recycle && git add app/how-it-works/page.tsx && git commit -m "feat: reskin how-it-works page to light theme"
```
