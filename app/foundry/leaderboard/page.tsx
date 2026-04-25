// app/foundry/leaderboard/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import type { LeaderboardResponse, LeaderboardRow } from '@/app/api/foundry/leaderboard/route';
import type { LeagueTier } from '@/lib/foundry-leagues';

// ── Helpers ────────────────────────────────────────────────────────────────────

function shortWallet(w: string): string {
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

const TIER_META: Record<LeagueTier, { label: string; emoji: string; bg: string; border: string; header: string }> = {
  bronze: { label: 'Bronze',  emoji: '🥉', bg: 'bg-amber-50',  border: 'border-amber-200',  header: 'text-amber-800'  },
  silver: { label: 'Silver',  emoji: '🥈', bg: 'bg-gray-50',   border: 'border-gray-200',   header: 'text-gray-700'   },
  gold:   { label: 'Gold',    emoji: '🥇', bg: 'bg-yellow-50', border: 'border-yellow-300', header: 'text-yellow-800' },
};

const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

// ── League table ───────────────────────────────────────────────────────────────

function LeagueTable({
  tier,
  rows,
  myWallet,
}: {
  tier: LeagueTier;
  rows: LeaderboardRow[];
  myWallet: string;
}) {
  const meta = TIER_META[tier];
  if (rows.length === 0) {
    return (
      <div className={`rounded-2xl border ${meta.border} ${meta.bg} px-5 py-8 text-center text-gray-400 text-sm`}>
        No forges in {meta.label} yet.
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border ${meta.border} ${meta.bg} overflow-hidden`}>
      <div className={`px-4 py-3 border-b ${meta.border} ${meta.header} font-bold text-sm flex items-center gap-2`}>
        {meta.emoji} {meta.label} League
        <span className="ml-auto text-xs font-normal text-gray-400">{rows.length} forges</span>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map(r => {
          const isMe = r.wallet === myWallet;
          return (
            <div
              key={r.forgeId}
              className={`flex items-center gap-3 px-4 py-3 text-sm ${isMe ? 'bg-amber-50 font-semibold' : ''}`}
            >
              {/* Rank */}
              <span className="w-7 text-center text-base leading-none flex-shrink-0">
                {RANK_MEDALS[r.rank] ?? <span className="text-gray-400 text-xs">#{r.rank}</span>}
              </span>

              {/* Forge info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/foundry/forge/${r.forgeId}`}
                    className="text-amber-700 hover:underline font-medium"
                  >
                    Forge #{r.forgeId}
                  </Link>
                  {isMe && (
                    <span className="text-[9px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-bold uppercase">you</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 font-mono truncate">{shortWallet(r.wallet)}</div>
              </div>

              {/* Streak badge */}
              {r.consecutiveActiveSeasons >= 2 && (
                <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                  🔥 {r.consecutiveActiveSeasons}w
                </span>
              )}

              {/* Score */}
              <div className="text-right flex-shrink-0">
                <div className="font-bold text-gray-900">{r.score.toLocaleString()}</div>
                <div className="text-[10px] text-gray-400">pts</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TIERS: LeagueTier[] = ['gold', 'silver', 'bronze'];

export default function LeaderboardPage() {
  const { publicKey } = useWallet();
  const myWallet = publicKey?.toBase58() ?? '';

  const [data, setData]       = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<LeagueTier>('gold');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/foundry/leaderboard');
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // Auto-select user's league if they have a forge
  useEffect(() => {
    if (!data || !myWallet) return;
    for (const tier of TIERS) {
      if (data[tier].some(r => r.wallet === myWallet)) {
        setTab(tier);
        return;
      }
    }
  }, [data, myWallet]);

  return (
    <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 pt-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">🏆 Forge Wars</h1>
          {data && (
            <p className="text-gray-400 text-sm mt-0.5">
              Season {data.season} · started{' '}
              {new Date(data.seasonStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>
        <Link href="/foundry" className="text-xs text-gray-400 hover:underline">← Back to map</Link>
      </div>

      {/* Prize pools info */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {(['gold', 'silver', 'bronze'] as LeagueTier[]).map(tier => {
          const meta = TIER_META[tier];
          const prizes = tier === 'gold'
            ? ['40k', '24k', '16k']
            : tier === 'silver'
            ? ['18k', '10k', '7k']
            : ['8k', '4k', '3k'];
          return (
            <div key={tier} className={`rounded-xl border ${meta.border} ${meta.bg} px-3 py-2 text-center`}>
              <div className="text-base mb-0.5">{meta.emoji}</div>
              <div className={`text-xs font-bold ${meta.header}`}>{meta.label}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{prizes.join(' / ')} SMELT</div>
            </div>
          );
        })}
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 mb-4 bg-stone-100 rounded-xl p-1">
        {TIERS.map(tier => (
          <button
            key={tier}
            onClick={() => setTab(tier)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              tab === tier
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {TIER_META[tier].emoji} {TIER_META[tier].label}
            {data && (
              <span className="ml-1 text-[10px] font-normal text-gray-400">
                ({data[tier].length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && <div className="h-48 rounded-2xl bg-gray-100 animate-pulse" />}

      {!loading && data && (
        <LeagueTable tier={tab} rows={data[tab]} myWallet={myWallet} />
      )}

      <p className="text-[10px] text-gray-400 text-center mt-4">
        Scores update live · Season ends Sunday 23:59 UTC
      </p>
    </div>
  );
}
