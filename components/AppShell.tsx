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
        setPendingSol(
          (d.liquidations?.undistributedSol ?? 0) + (d.fees?.undistributedSol ?? 0)
        );
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
              <span className="font-extrabold text-gray-900 text-[15px]">Recycler</span>
            </div>
            <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1" aria-label="Close menu">✕</button>
          </div>

          <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
            {allNavItems.map(({ href, label, icon }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] font-medium transition-colors',
                    active ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  ].join(' ')}
                >
                  <span className="text-base">{icon}</span><span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {connected && publicKey && (
            <div className="p-4 border-t border-gray-100">
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 mb-3 space-y-1.5">
                <div className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">Wallet</div>
                <div className="text-gray-700 text-xs font-mono">{shortAddr(publicKey.toBase58())}</div>
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-gray-400">SMELT</span>
                  <span className="text-gray-700 font-semibold">{(Number(smeltBalance) / 1e9).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">NAV</span>
                  <span className="text-indigo-500 font-semibold">{nav} SOL</span>
                </div>
              </div>
              <button
                onClick={() => disconnect()}
                className="w-full text-gray-500 text-[15px] font-medium rounded-xl py-2.5 border border-gray-200 hover:border-gray-300 hover:text-gray-700 transition-all"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      )}

      {/* TOP NAV */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6" style={{ height: '3.75rem' }}>

        {/* Mobile: hamburger + logo */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-gray-500 hover:text-gray-800 p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/" className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-green-600 flex items-center justify-center text-white text-sm font-bold">♻</div>
            <span className="font-extrabold text-gray-900 text-[15px]">Recycler</span>
          </Link>
        </div>

        {/* Desktop: logo + nav links */}
        <div className="hidden md:flex items-center gap-6 flex-1">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold">♻</div>
            <span className="font-extrabold text-gray-900 text-base tracking-tight">Recycler</span>
          </Link>
          <nav className="flex items-center gap-0.5">
            {allNavItems.map(({ href, label }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'px-3 py-1.5 rounded-lg text-[15px] font-medium transition-colors',
                    active ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                  ].join(' ')}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side — single WalletMultiButton */}
        <div className="ml-auto flex items-center gap-3">
          {mounted && connected && publicKey && (
            <span className="hidden md:inline text-sm font-mono bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full">
              {shortAddr(publicKey.toBase58())}
            </span>
          )}
          {mounted ? (
            <WalletMultiButton className="!text-[15px] !font-semibold !rounded-xl" />
          ) : (
            <div className="w-32 h-9 rounded-xl bg-green-100 animate-pulse" />
          )}
        </div>
      </header>

      {/* STATS BAR */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-stretch w-full">
          {[
            {
              label: 'Supply',
              value: `${fmtSupply(totalSupply)} SMELT`,
              tooltip: 'Total circulating SMELT supply on-chain.',
            },
            {
              label: 'Pool',
              value: `${pendingSol > 0 ? pendingSol.toFixed(4) : '—'} SOL`,
              tooltip: 'SOL accumulated from fees and token liquidations, waiting to be distributed to SMELT holders.',
            },
            {
              label: 'Recycled',
              value: totalAccountsClosed > 0 ? totalAccountsClosed.toLocaleString() : '—',
              tooltip: 'Total token accounts closed by all users since launch.',
              accent: 'green',
            },
            {
              label: 'Chain freed',
              value: fmtBytes(totalAccountsClosed * 165),
              tooltip: 'On-chain state removed. Each SPL token account is exactly 165 bytes — closing accounts shrinks the global state that every Solana validator must load.',
              accent: 'green',
            },
          ].map(({ label, value, tooltip, accent }, i) => (
            <div key={label} className="relative group flex-1 flex items-stretch">
              {i > 0 && <div className="w-px bg-gray-100 my-2 flex-shrink-0" />}
              <div className="flex-1 flex flex-col justify-center px-3 sm:px-5 py-2.5 cursor-default select-none">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 whitespace-nowrap">
                    {label}
                  </span>
                  <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className={`text-sm font-bold tabular-nums leading-none ${accent === 'green' ? 'text-green-600' : 'text-gray-900'}`}>
                  {value}
                </span>
              </div>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl text-center">
                {tooltip}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PAGE CONTENT */}
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}
