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
