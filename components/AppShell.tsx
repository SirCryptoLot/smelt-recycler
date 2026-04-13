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
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingSol, setPendingSol] = useState(0);
  const [totalSupply, setTotalSupply] = useState(0);

  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close mobile sidebar on navigation
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

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

  const smeltUi = Number(smeltBalance) / 1e9;
  const nav = totalSupply > 0 && pendingSol > 0
    ? (pendingSol / totalSupply).toFixed(6)
    : '0.000000';

  // Admin pages manage their own layout
  if (pathname.startsWith('/admin')) {
    return (
      <div className="h-screen bg-[#060f0d] text-white overflow-hidden">
        {children}
      </div>
    );
  }

  const sidebarVisible = !isMobile || sidebarOpen;

  return (
    <div className="flex h-screen bg-[#060f0d] text-white overflow-hidden">

      {/* Backdrop — mobile only, shown when sidebar open */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Single sidebar — in-flow on desktop, fixed overlay on mobile */}
      {mounted && (
        <aside
          style={isMobile ? {
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 50,
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            width: '288px',
          } : {
            position: 'relative',
            width: '208px',
            flexShrink: 0,
          }}
          className="flex flex-col border-r border-white/5 bg-[#09140f]"
        >
          {/* Brand */}
          <div className="px-5 pt-6 pb-5 border-b border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-lg leading-none">
                  ♻
                </div>
                <div>
                  <div className="text-white font-bold text-sm tracking-tight">Recycler</div>
                  <div className="text-emerald-500/50 text-[11px]">Reclaim your SOL</div>
                </div>
              </div>
              {isMobile && (
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="text-white/30 hover:text-white/60 text-xl leading-none p-1"
                  aria-label="Close menu"
                >
                  ✕
                </button>
              )}
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
          </nav>

          {/* Wallet section */}
          <div className="p-4 border-t border-white/5">
            {connected && publicKey ? (
              <>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 mb-3 space-y-1.5">
                  <div className="text-[10px] font-semibold tracking-widest text-white/25 uppercase">Wallet</div>
                  <div className="text-white/70 text-xs font-mono">{shortAddr(publicKey.toBase58())}</div>
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
      )}

      {/* Page content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar — only shown after mount on small screens */}
        {mounted && isMobile && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 flex-shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-white/50 hover:text-white transition-colors text-xl leading-none"
              aria-label="Open menu"
            >
              ☰
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-emerald-500/15 flex items-center justify-center text-sm leading-none">♻</div>
              <span className="text-white font-semibold text-sm">Recycler</span>
            </div>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
