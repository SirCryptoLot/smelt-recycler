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
  { href: '/foundry', label: 'Foundry', icon: '⚒' },
  { href: '/treasury', label: 'Treasury', icon: '🏦' },
  { href: '/stake', label: 'Stake', icon: '🔒' },
  { href: '/how-it-works', label: 'How it works', icon: '📖' },
];

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtSupply(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtBytes(n: number): string {
  if (n === 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
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
  const [totalAccountsClosed, setTotalAccountsClosed] = useState(0);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    fetch('/api/stats', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setPendingSol((d.liquidations?.undistributedSol ?? 0) + (d.fees?.undistributedSol ?? 0));
        setTotalAccountsClosed(d.fees?.totalAccountsClosed ?? 0);
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
    return <>{children}</>;
  }

  // Game pages keep the main app header (so users can navigate out) but skip
  // the stats bar — the game has its own ingot/forge HUD and we don't want
  // to eat too much vertical space on mobile.
  const showStatsBar = !pathname.startsWith('/foundry');

  const allNavItems = [
    ...NAV_ITEMS,
    ...(connected && publicKey ? [{ href: '/dashboard', label: 'Dashboard', icon: '👤' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#f0faf4] flex flex-col">

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      {mounted && (
        <div
          className="fixed top-0 left-0 bottom-0 z-50 w-72 bg-white border-r border-green-100 flex flex-col md:hidden"
          style={{ transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.28s cubic-bezier(0.16,1,0.3,1)' }}
        >
          <div className="flex items-center justify-between px-5 py-5 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center text-white font-bold text-lg">♻</div>
              <span className="font-extrabold text-gray-900 text-lg tracking-tight">Recycler</span>
            </div>
            <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1.5 rounded-lg hover:bg-gray-100" aria-label="Close menu">✕</button>
          </div>

          <nav className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">
            {allNavItems.map(({ href, label, icon }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-colors',
                    active ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  ].join(' ')}
                >
                  <span className="text-lg w-6 text-center">{icon}</span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {connected && publicKey && (
            <div className="p-4 border-t border-gray-100 space-y-2">
              {/* SMELT balance */}
              <div className="bg-green-600 rounded-2xl px-4 py-3 flex items-center justify-between">
                <span className="text-green-100 text-xs font-semibold tracking-widest uppercase">SMELT</span>
                <span className="text-white font-extrabold text-lg tabular-nums">
                  {(Number(smeltBalance) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              {/* Wallet address */}
              <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-gray-500 font-mono text-sm truncate">{shortAddr(publicKey.toBase58())}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(publicKey.toBase58()).catch(() => {})}
                  className="text-gray-300 hover:text-green-600 transition-colors flex-shrink-0"
                  title="Copy address"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              {/* Disconnect */}
              <button
                onClick={() => disconnect()}
                className="w-full text-gray-500 text-sm font-semibold rounded-xl py-3 border border-gray-200 hover:border-gray-300 hover:text-gray-700 hover:bg-gray-50 transition-all"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      )}

      {/* TOP NAV */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-green-100/60 flex justify-center" style={{ height: '4rem' }}>
      <div className="w-full max-w-[900px] px-4 sm:px-6 flex items-center h-full">

        {/* Mobile: hamburger + logo */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-gray-500 hover:text-gray-800 p-2 -ml-2 rounded-xl hover:bg-green-50 transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-green-600 flex items-center justify-center text-white text-sm font-bold">♻</div>
            <span className="font-extrabold text-gray-900 text-lg tracking-tight">Recycler</span>
          </Link>
        </div>

        {/* Desktop: logo + nav */}
        <div className="hidden md:flex items-center gap-6 flex-1">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center text-white font-bold text-base">♻</div>
            <span className="font-extrabold text-gray-900 text-xl tracking-tight">Recycler</span>
          </Link>
          <nav className="flex items-center gap-0.5">
            {allNavItems.map(({ href, label }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'px-3 py-2 rounded-xl text-[14px] font-medium transition-colors whitespace-nowrap',
                    active ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                  ].join(' ')}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: wallet button */}
        <div className="ml-auto flex items-center gap-3">
          {mounted && connected && publicKey && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-sm font-bold bg-green-50 text-green-700 px-3 py-1.5 rounded-full border border-green-100 tabular-nums">
              <span className="text-green-500 text-xs font-extrabold">SMELT</span>
              {(Number(smeltBalance) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          )}
          {mounted ? (
            <WalletMultiButton className="!text-[15px] !font-semibold !rounded-full" />
          ) : (
            <div className="w-32 h-10 rounded-full bg-green-100 animate-pulse" />
          )}
        </div>
      </div>
      </header>

      {/* STATS BAR */}
      {showStatsBar && (
      <div className="bg-white/70 backdrop-blur-sm border-b border-green-100/60">
        {/* Mobile: 2×2 grid */}
        <div className="grid grid-cols-2 sm:hidden w-full divide-x divide-y divide-green-100/60">
          {[
            { label: 'Circulating', value: `${fmtSupply(totalSupply)} SMELT`, accent: false },
            { label: 'Reward pool', value: `${pendingSol > 0 ? pendingSol.toFixed(4) : '—'} SOL`, accent: false },
            { label: 'Accounts', value: totalAccountsClosed > 0 ? totalAccountsClosed.toLocaleString() : '—', accent: true },
            { label: 'State freed', value: fmtBytes(totalAccountsClosed * 165), accent: true },
          ].map(({ label, value, accent }) => (
            <div key={label} className="px-3 py-2">
              <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-0.5">{label}</div>
              <span className={`text-sm font-bold tabular-nums leading-tight ${accent ? 'text-green-600' : 'text-gray-900'}`}>{value}</span>
            </div>
          ))}
        </div>
        {/* Desktop: single row */}
        <div className="hidden sm:flex items-stretch w-full max-w-[900px] mx-auto">
          {[
            { label: 'Circulating', value: `${fmtSupply(totalSupply)} SMELT`, sub: 'supply', tooltip: 'Total circulating SMELT supply on-chain.' },
            { label: 'Reward pool', value: `${pendingSol > 0 ? pendingSol.toFixed(4) : '—'} SOL`, sub: 'pending', tooltip: 'Undistributed SOL waiting for SMELT holders.' },
            { label: 'Accounts', value: totalAccountsClosed > 0 ? totalAccountsClosed.toLocaleString() : '—', sub: 'recycled', tooltip: 'Total token accounts closed platform-wide.', accent: true },
            { label: 'State freed', value: fmtBytes(totalAccountsClosed * 165), sub: 'on-chain', tooltip: 'On-chain data removed (165 B per account).', accent: true },
          ].map(({ label, value, sub, tooltip, accent }, i) => (
            <div key={label} className="relative group flex-1 flex items-stretch">
              {i > 0 && <div className="w-px bg-green-100 my-2.5 flex-shrink-0" />}
              <div className="flex-1 flex flex-col justify-center px-5 py-2.5 cursor-default select-none">
                <span className="text-[9px] font-bold tracking-widest uppercase text-gray-400 whitespace-nowrap mb-0.5">{label}</span>
                <span className={`text-sm font-extrabold tabular-nums leading-tight ${accent ? 'text-green-600' : 'text-gray-900'}`}>{value}</span>
                <span className="text-[9px] text-gray-300 mt-0.5 uppercase tracking-wide">{sub}</span>
              </div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-52 bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl text-center">
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
                {tooltip}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* PAGE CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        {children}
      </main>
    </div>
  );
}
