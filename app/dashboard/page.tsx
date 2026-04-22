// app/dashboard/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSmelt } from '@/lib/smelt-context';
import Link from 'next/link';

interface DashboardData {
  activity: {
    weeklyAccounts: number;
    weeklyRank: number;
    allTimeAccounts: number;
    allTimeSolReclaimed: number;
    allTimeSmeltEarned: number;
  };
  referral: {
    referrals: { referee: string; accountsClosed: number; bonusEarned: number; smeltBonus: number; date: string }[];
    pendingBonus: number;
    totalEarned: number;
    count: number;
    code: string;
  };
  distributions: {
    recent: { date: string; totalSol: number; recipientCount: number }[];
    nextDistributionDate: string | null;
  };
}

interface StakeData {
  stakedUi: number;
  sharePct: number;
  totalSmeltStaked: string;
}

function shortAddr(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-lg ${className ?? ''}`} />;
}

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const { smeltBalance } = useSmelt();
  const [data, setData]           = useState<DashboardData | null>(null);
  const [stakeData, setStakeData] = useState<StakeData | null>(null);
  const [smeltPrice, setSmeltPrice] = useState<number | null>(null);
  const [pendingSol, setPendingSol] = useState<number>(0);
  const [mounted, setMounted]     = useState(false);
  const [copied, setCopied]       = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const load = useCallback(async () => {
    if (!publicKey) return;
    const [dashRes, stakeRes, priceRes, statsRes] = await Promise.all([
      fetch(`/api/dashboard?wallet=${publicKey.toBase58()}`, { cache: 'no-store' }),
      fetch(`/api/stake?wallet=${publicKey.toBase58()}`,     { cache: 'no-store' }),
      fetch('/api/smelt-price',                              { cache: 'no-store' }),
      fetch('/api/stats',                                    { cache: 'no-store' }),
    ]);
    if (dashRes.ok)  setData(await dashRes.json() as DashboardData);
    if (stakeRes.ok) setStakeData(await stakeRes.json() as StakeData);
    if (priceRes.ok) {
      const p = await priceRes.json() as { price: number | null };
      if (p.price) setSmeltPrice(p.price);
    }
    if (statsRes.ok) {
      const s = await statsRes.json() as { liquidations?: { undistributedSol?: number }; fees?: { undistributedSol?: number } };
      setPendingSol((s.liquidations?.undistributedSol ?? 0) + (s.fees?.undistributedSol ?? 0));
    }
  }, [publicKey]);

  useEffect(() => { if (connected && publicKey) load(); }, [connected, publicKey, load]);

  const smeltUi    = Number(smeltBalance) / 1e9;
  const stakedUi   = stakeData?.stakedUi ?? 0;
  const unstakedUi = Math.max(0, smeltUi - stakedUi);
  const weight     = unstakedUi + stakedUi * 1.5;
  const sharePct   = stakeData?.sharePct ?? 0;
  const estPayout  = pendingSol > 0 && sharePct > 0 ? pendingSol * sharePct / 100 : null;
  const smeltUsd   = smeltPrice != null ? smeltUi * smeltPrice : null;

  const refCode = data?.referral.code ?? '';
  const referralLink = typeof window !== 'undefined' && refCode
    ? `${window.location.origin}/?ref=${refCode}`
    : '';

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = () => {
    if (navigator.share && referralLink) {
      navigator.share({
        title: '♻ Recycler — Reclaim your SOL',
        text: `I cleaned my Solana wallet and reclaimed SOL from ${data?.activity.allTimeAccounts ?? 0} dust accounts. Use my code ${refCode} — close dead token accounts and earn SMELT!`,
        url: referralLink,
      });
    }
  };

  if (!mounted) return null;

  if (!connected || !publicKey) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="text-gray-900 font-bold text-xl">Connect your wallet</div>
        <div className="text-gray-400 text-sm max-w-xs">Connect to see your SMELT balance, recycling history, and referral earnings.</div>
        <WalletMultiButton className="!bg-green-600 !text-white !font-bold !rounded-full !px-8 !py-3 !h-auto !text-base" />
      </main>
    );
  }

  const loading = data === null;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Dashboard</h1>
            <div className="text-gray-400 text-sm mt-1 font-mono">{shortAddr(publicKey.toBase58())}</div>
          </div>
          <button onClick={load} title="Refresh" className="text-gray-300 hover:text-green-600 transition-colors p-2 rounded-xl hover:bg-green-50">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* SMELT Holdings */}
        <section>
          <h2 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">Holdings</h2>
          <div className="rounded-2xl bg-green-600 px-5 py-5 flex items-center justify-between gap-4 mb-3">
            <div>
              <div className="text-green-100 text-xs font-semibold tracking-widest uppercase mb-1">SMELT Balance</div>
              <div className="text-white font-extrabold text-3xl tabular-nums leading-none">
                {smeltUi.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              {smeltUsd != null && (
                <div className="text-green-200 text-sm mt-1.5 tabular-nums">
                  ≈ ${smeltUsd.toFixed(smeltUsd < 0.01 ? 6 : 2)}
                </div>
              )}
            </div>
            {stakedUi > 0 && (
              <div className="text-right flex-shrink-0">
                <div className="text-green-200 text-xs font-semibold mb-1">Staked</div>
                <div className="text-white font-bold text-xl tabular-nums">{stakedUi.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                <div className="text-green-300 text-xs mt-0.5">1.5× weight</div>
              </div>
            )}
          </div>

          {/* Staking CTA if has unstaked */}
          {unstakedUi > 0 && (
            <Link
              href="/stake"
              className="flex items-center justify-between rounded-2xl border border-green-100 bg-green-50 px-4 py-3 mb-3 group hover:border-green-200 transition-colors"
            >
              <div>
                <div className="text-green-800 font-semibold text-sm">Stake {unstakedUi.toLocaleString(undefined, { maximumFractionDigits: 0 })} SMELT for 1.5× weight</div>
                <div className="text-green-600 text-xs mt-0.5">Earn a larger share of each SOL distribution</div>
              </div>
              <span className="text-green-600 group-hover:translate-x-0.5 transition-transform">→</span>
            </Link>
          )}
        </section>

        {/* Stats */}
        <section>
          <h2 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">Activity</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4">
                  <Skeleton className="h-3 w-16 mb-3" />
                  <Skeleton className="h-7 w-20 mb-2" />
                  <Skeleton className="h-2.5 w-12" />
                </div>
              ))
            ) : (
              [
                { label: 'Accounts closed', value: (data?.activity.allTimeAccounts ?? 0).toLocaleString(), sub: 'all-time' },
                { label: 'SOL reclaimed',   value: (data?.activity.allTimeSolReclaimed ?? 0).toFixed(4), unit: 'SOL', sub: 'all-time' },
                { label: 'SMELT earned',    value: (data?.activity.allTimeSmeltEarned ?? 0).toLocaleString(), sub: 'from recycling' },
                { label: 'This week',       value: (data?.activity.weeklyAccounts ?? 0).toLocaleString(), sub: 'accounts closed' },
                { label: 'Weekly rank',     value: data?.activity.weeklyRank ? `#${data.activity.weeklyRank}` : '—', sub: 'leaderboard' },
                { label: 'Referrals',       value: (data?.referral.count ?? 0).toLocaleString(), sub: 'wallets referred' },
              ].map(({ label, value, unit, sub }) => (
                <div key={label} className="rounded-2xl bg-white border border-gray-100 px-4 py-4">
                  <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">{label}</div>
                  <div className="text-gray-900 font-extrabold text-xl tabular-nums leading-none">
                    {value}{unit && <span className="text-sm font-medium ml-1 text-gray-500">{unit}</span>}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1.5">{sub}</div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Rewards */}
        <section>
          <h2 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">Rewards</h2>
          <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-400 mb-1">Your pool share</div>
                {loading ? <Skeleton className="h-5 w-16" /> : (
                  <div className="text-gray-900 font-bold text-lg">
                    {sharePct > 0 ? `${sharePct.toFixed(2)}%` : '—'}
                  </div>
                )}
                <div className="text-[11px] text-gray-400 mt-0.5">of staking pool</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Est. next payout</div>
                {loading ? <Skeleton className="h-5 w-20" /> : (
                  <div className="text-green-600 font-bold text-lg tabular-nums">
                    {estPayout != null ? `${estPayout.toFixed(6)} SOL` : '—'}
                  </div>
                )}
                <div className="text-[11px] text-gray-400 mt-0.5">based on pending pool</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Dist. weight</div>
                {loading ? <Skeleton className="h-5 w-16" /> : (
                  <div className="text-gray-900 font-semibold">
                    {weight > 0 ? weight.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
                  </div>
                )}
                <div className="text-[11px] text-gray-400 mt-0.5">unstaked + staked×1.5</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Next distribution</div>
                {loading ? <Skeleton className="h-5 w-24" /> : (
                  <div className="text-gray-900 font-semibold">
                    {data?.distributions.nextDistributionDate
                      ? formatDate(data.distributions.nextDistributionDate)
                      : 'Not scheduled'}
                  </div>
                )}
                <div className="text-[11px] text-gray-400 mt-0.5">approx. every 48h</div>
              </div>
            </div>

            {!loading && (data?.distributions.recent.length ?? 0) > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-gray-100">
                <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Recent distributions</div>
                {data!.distributions.recent.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-500">{formatDate(d.date)}</span>
                    <span className="text-green-600 font-semibold tabular-nums">{d.totalSol.toFixed(6)} SOL</span>
                    <span className="text-gray-400 text-xs">{d.recipientCount} recipients</span>
                  </div>
                ))}
              </div>
            )}
            {!loading && (data?.distributions.recent.length ?? 0) === 0 && (
              <div className="text-gray-400 text-sm pt-1 border-t border-gray-100">No distributions yet.</div>
            )}
          </div>
        </section>

        {/* Referrals */}
        <section>
          <h2 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">Referrals</h2>
          <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">

            {/* Code */}
            <div>
              <div className="text-xs text-gray-400 mb-1.5">Your code</div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-2xl font-extrabold font-mono tracking-widest text-gray-900 text-center">
                {loading ? <Skeleton className="h-7 w-24 mx-auto" /> : (refCode || '…')}
              </div>
            </div>

            {/* Link */}
            <div>
              <div className="text-xs text-gray-400 mb-1.5">Your referral link</div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500 font-mono break-all leading-relaxed">
                {loading ? <Skeleton className="h-4 w-full" /> : (referralLink || '…')}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={copyLink}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:text-gray-800 hover:border-gray-300 transition-all"
              >
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button
                  onClick={shareLink}
                  className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-sm font-semibold text-white transition-all"
                >
                  Share
                </button>
              )}
            </div>

            {/* Info */}
            <div className="text-xs text-gray-400 bg-green-50 rounded-xl px-3 py-2.5 leading-relaxed">
              Friends who join via your link earn SMELT as usual — you get <span className="font-semibold text-green-700">1% of their SOL reclaim + 20% SMELT bonus</span> on their first session.
            </div>

            {/* Earnings summary */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
              <div>
                <div className="text-xs text-gray-400 mb-1">Pending SOL bonus</div>
                {loading ? <Skeleton className="h-5 w-20" /> : (
                  <div className="text-green-600 font-semibold tabular-nums">{(data?.referral.pendingBonus ?? 0).toFixed(6)} SOL</div>
                )}
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Total earned</div>
                {loading ? <Skeleton className="h-5 w-20" /> : (
                  <div className="text-gray-900 font-semibold tabular-nums">{(data?.referral.totalEarned ?? 0).toFixed(6)} SOL</div>
                )}
              </div>
            </div>

            {/* Recent referrals list */}
            {!loading && (data?.referral.referrals.length ?? 0) > 0 && (
              <div className="space-y-1 pt-1 border-t border-gray-100">
                <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Recent referrals</div>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                  {data!.referral.referrals.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-3 gap-3">
                      <div>
                        <div className="text-gray-700 font-mono text-xs">{shortAddr(r.referee)}</div>
                        <div className="text-gray-400 text-[11px] mt-0.5">{r.accountsClosed} accounts · {formatDate(r.date)}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-green-600 font-semibold text-sm tabular-nums">+{r.bonusEarned.toFixed(4)} SOL</div>
                        {r.smeltBonus > 0 && <div className="text-gray-400 text-[11px]">+{r.smeltBonus.toLocaleString()} SMELT</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
