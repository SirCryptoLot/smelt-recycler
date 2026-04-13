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
        <div className="text-white font-semibold">Connect your wallet to view your dashboard</div>
        <WalletMultiButton className="!bg-emerald-500 !text-white !font-semibold !text-sm !rounded-xl !px-6 !py-2.5" />
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Dashboard</h1>
          <div className="text-zinc-500 text-xs mt-1 font-mono">{shortAddr(publicKey.toBase58())}</div>
        </div>

        {/* Portfolio strip */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">Portfolio</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'SMELT Balance', value: smeltUi.toLocaleString(), sub: 'total holdings', color: 'text-emerald-400' },
              { label: 'Staked', value: stakedUi.toLocaleString(), sub: '1.5× weight active', color: 'text-zinc-100', badge: stakedUi > 0 },
              { label: 'Distribution weight', value: weight.toLocaleString(undefined, { maximumFractionDigits: 0 }), sub: `${unstakedUi.toFixed(0)} × 1 + ${stakedUi.toFixed(0)} × 1.5`, color: 'text-indigo-400' },
              { label: 'SOL reclaimed', value: `${(data?.activity.allTimeSolReclaimed ?? 0).toFixed(4)} SOL`, sub: 'all-time from recycling', color: 'text-zinc-100' },
            ].map(({ label, value, sub, color, badge }) => (
              <div key={label} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-zinc-500 mb-1">{label}</div>
                <div className={`text-lg font-bold ${color} flex items-center gap-1.5`}>
                  {value}
                  {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">1.5×</span>}
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Activity */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">Activity</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Accounts closed (all-time)', value: (data?.activity.allTimeAccounts ?? 0).toLocaleString() },
              { label: 'SOL reclaimed (all-time)', value: `${(data?.activity.allTimeSolReclaimed ?? 0).toFixed(4)} SOL` },
              { label: 'SMELT earned recycling', value: (data?.activity.allTimeSmeltEarned ?? 0).toLocaleString() },
              { label: 'Accounts this week', value: (data?.activity.weeklyAccounts ?? 0).toLocaleString() },
              { label: 'Weekly rank', value: data?.activity.weeklyRank ? `#${data.activity.weeklyRank}` : '—' },
              { label: 'Referrals', value: (data?.referral.count ?? 0).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                <div className="text-xs text-zinc-500 mb-1">{label}</div>
                <div className="text-zinc-100 font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Referrals */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">Referrals</h2>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
            <div>
              <div className="text-xs text-zinc-500 mb-2">Your referral link</div>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400 font-mono truncate">
                  {referralLink}
                </div>
                <button
                  onClick={copyLink}
                  className="px-3 py-2 rounded-xl border border-white/10 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-all flex-shrink-0"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={shareLink}
                    className="px-3 py-2 rounded-xl border border-white/10 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-all flex-shrink-0"
                  >
                    Share
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Pending bonus</div>
                <div className="text-emerald-400 font-semibold">{(data?.referral.pendingBonus ?? 0).toFixed(6)} SOL</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Total earned</div>
                <div className="text-zinc-100 font-semibold">{(data?.referral.totalEarned ?? 0).toFixed(6)} SOL</div>
              </div>
            </div>

            {(data?.referral.referrals.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-zinc-600">Recent referrals</div>
                {data!.referral.referrals.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-mono">{shortAddr(r.referee)}</span>
                    <span className="text-zinc-600">{r.accountsClosed} accounts</span>
                    <span className="text-emerald-500/70">+{r.bonusEarned.toFixed(6)} SOL</span>
                    <span className="text-zinc-600">{formatDate(r.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Rewards / Distributions */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">Rewards</h2>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Next distribution</div>
                <div className="text-zinc-100 font-semibold">
                  {data?.distributions.nextDistributionDate
                    ? formatDate(data.distributions.nextDistributionDate)
                    : 'Not scheduled'}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Your weight</div>
                <div className="text-zinc-100 font-semibold">
                  {weight.toLocaleString(undefined, { maximumFractionDigits: 0 })} units
                </div>
              </div>
            </div>

            {(data?.distributions.recent.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <div className="text-xs text-zinc-600">Recent distributions (platform-wide)</div>
                {data!.distributions.recent.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-zinc-400">{formatDate(d.date)}</span>
                    <span className="text-emerald-400">{d.totalSol.toFixed(6)} SOL</span>
                    <span className="text-zinc-600">{d.recipientCount} recipients</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-zinc-600 text-sm">No distributions yet.</div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
