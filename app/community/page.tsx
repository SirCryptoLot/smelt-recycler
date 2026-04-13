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
