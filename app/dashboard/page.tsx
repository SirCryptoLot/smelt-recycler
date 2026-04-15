// app/dashboard/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
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
    fetchStakeInfo(publicKey)
      .then((info) => setSmeltStaked(info?.smeltStaked ?? 0n))
      .catch(() => {});
  }, [publicKey]);

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
      <main className="flex-1 flex flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="text-gray-900 font-bold text-xl">Connect your wallet</div>
        <div className="text-gray-400 text-sm max-w-xs">Connect to see your SMELT balance, recycling history, and referral earnings.</div>
        <WalletMultiButton className="!bg-green-600 !text-white !font-bold !rounded-full !px-8 !py-3 !h-auto !text-base" />
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Dashboard</h1>
          <div className="text-gray-400 text-sm mt-1 font-mono">{shortAddr(publicKey.toBase58())}</div>
        </div>

        {/* Portfolio */}
        <section>
          <h2 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-4">Portfolio</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">SMELT</div>
              <div className="text-green-600 font-extrabold text-2xl tabular-nums leading-none">{smeltUi.toLocaleString()}</div>
              <div className="text-[11px] text-gray-400 mt-1.5">total holdings</div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Staked</div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-gray-900 font-extrabold text-2xl tabular-nums">{stakedUi.toLocaleString()}</span>
                {stakedUi > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">1.5×</span>}
              </div>
              <div className="text-[11px] text-gray-400 mt-1.5">weight active</div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Dist. Weight</div>
              <div className="text-gray-900 font-extrabold text-2xl tabular-nums leading-none">{weight.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              <div className="text-[11px] text-gray-400 mt-1.5">{unstakedUi.toFixed(0)} + {stakedUi.toFixed(0)}×1.5</div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">SOL reclaimed</div>
              <div className="text-gray-900 font-extrabold text-2xl tabular-nums leading-none">{(data?.activity.allTimeSolReclaimed ?? 0).toFixed(4)}</div>
              <div className="text-[11px] text-gray-400 mt-1.5">all-time</div>
            </div>
          </div>
        </section>

        {/* Activity */}
        <section>
          <h2 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-4">Activity</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Accounts closed', value: (data?.activity.allTimeAccounts ?? 0).toLocaleString(), sub: 'all-time' },
              { label: 'SOL reclaimed', value: `${(data?.activity.allTimeSolReclaimed ?? 0).toFixed(4)}`, unit: 'SOL', sub: 'all-time' },
              { label: 'SMELT earned', value: (data?.activity.allTimeSmeltEarned ?? 0).toLocaleString(), sub: 'from recycling' },
              { label: 'This week', value: (data?.activity.weeklyAccounts ?? 0).toLocaleString(), sub: 'accounts' },
              { label: 'Weekly rank', value: data?.activity.weeklyRank ? `#${data.activity.weeklyRank}` : '—', sub: 'leaderboard position' },
              { label: 'Referrals', value: (data?.referral.count ?? 0).toLocaleString(), sub: 'wallets referred' },
            ].map(({ label, value, unit, sub }) => (
              <div key={label} className="rounded-2xl bg-white border border-gray-100 px-4 py-4">
                <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">{label}</div>
                <div className="text-gray-900 font-extrabold text-xl tabular-nums leading-none">
                  {value}{unit && <span className="text-sm font-medium ml-1">{unit}</span>}
                </div>
                <div className="text-[11px] text-gray-400 mt-1.5">{sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Referrals */}
        <section>
          <h2 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-4">Referrals</h2>
          <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-gray-400">Your referral link</div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500 font-mono break-all leading-relaxed">
                {referralLink}
              </div>
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
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:text-gray-800 hover:border-gray-300 transition-all"
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
                <div className="text-xs text-gray-400">Recent referrals</div>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                  {data!.referral.referrals.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-3 gap-3">
                      <div>
                        <div className="text-gray-700 font-mono text-xs">{shortAddr(r.referee)}</div>
                        <div className="text-gray-400 text-[11px] mt-0.5">{r.accountsClosed} accounts · {formatDate(r.date)}</div>
                      </div>
                      <span className="text-green-600 font-semibold text-sm flex-shrink-0">+{r.bonusEarned.toFixed(4)} SOL</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Rewards / Distributions */}
        <section>
          <h2 className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-4">Rewards</h2>
          <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
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
                <div className="text-xs text-gray-400">Recent distributions (platform-wide)</div>
                {data!.distributions.recent.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-gray-500">{formatDate(d.date)}</span>
                    <span className="text-green-600">{d.totalSol.toFixed(6)} SOL</span>
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
