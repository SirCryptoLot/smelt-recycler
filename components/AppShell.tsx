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

    try {
      (connection as Connection).getTokenSupply(SMELT_MINT)
        .then((s) => setTotalSupply(s.value.uiAmount ?? 0))
        .catch(() => {});
    } catch {
      // connection not available (e.g. in tests)
    }
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
