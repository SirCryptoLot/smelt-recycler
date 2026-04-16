// app/pools/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { fetchPoolsData, PoolsData } from '@/lib/pools';
import { fetchSmeltBalance, fetchStakeInfo } from '@/lib/smelt';

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function PoolsPage() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  const [data, setData] = useState<PoolsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [smeltBalance, setSmeltBalance] = useState(0n);
  const [sharePct, setSharePct] = useState(0);
  const [nextDistFromPool, setNextDistFromPool] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [d, poolRes] = await Promise.all([
        fetchPoolsData(),
        fetch('/api/pool', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setData(d);
      if (poolRes?.nextDistributionAt) setNextDistFromPool(poolRes.nextDistributionAt);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(() => refresh(true), 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (!publicKey) return;
    fetchSmeltBalance(connection, publicKey).then(setSmeltBalance).catch(console.error);
    fetchStakeInfo(publicKey)
      .then((info) => setSharePct(info?.sharePct ?? 0))
      .catch(console.error);
  }, [publicKey, connection]);

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  const tokens = data?.tokens ?? [];
  const recentLiquidations = data?.liquidations.recent ?? [];
  const undistributedLiquidationSol = data?.liquidations.undistributedSol ?? 0;
  const undistributedFeeSol = data?.fees?.undistributedSol ?? 0;
  const totalFeesCollected = data?.fees?.totalCollected ?? 0;
  const totalAccountsClosed = data?.fees?.totalAccountsClosed ?? 0;
  const undistributedSol = undistributedLiquidationSol + undistributedFeeSol;
  const totalSolDistributed = data?.distributions.totalSolDistributed ?? 0;
  const nextDistDate = data?.distributions.nextDistributionDate ?? null;

  const smeltBalanceUi = Number(smeltBalance) / 1e9;
  const estShare = sharePct > 0 ? (sharePct / 100) * undistributedSol : 0;
  const nextDist = nextDistFromPool ?? nextDistDate;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Pools</h1>
            <p className="text-gray-400 text-sm mt-1">Vault contents, fee revenue &amp; distribution stats</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => refresh()}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 disabled:opacity-40 transition-all font-medium"
            >
              <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Vault Contents */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Vault Contents</h2>
          {tokens.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-6 text-gray-400 text-sm">
              Vault is empty — no tokens accumulated yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
              {/* Mobile: stacked cards */}
              <div className="sm:hidden divide-y divide-gray-100">
                {tokens.map((token) => (
                  <div key={token.mint} className="px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-gray-700">{shortAddr(token.mint)}</span>
                      <span className="text-gray-900 font-bold tabular-nums">${token.usdValue.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${token.pctOfThreshold}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums w-16 text-right">{token.pctOfThreshold.toFixed(0)}% of $10</span>
                    </div>
                    <div className="text-xs text-gray-400 tabular-nums">{token.uiAmount.toLocaleString()} tokens</div>
                  </div>
                ))}
              </div>
              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 text-xs">
                      <th className="text-left px-4 py-3">Token</th>
                      <th className="text-right px-4 py-3">Balance</th>
                      <th className="text-right px-4 py-3">USD Value</th>
                      <th className="px-4 py-3 w-36">Progress to $10</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((token) => (
                      <tr key={token.mint} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 font-mono text-gray-700">{shortAddr(token.mint)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{token.uiAmount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-700">${token.usdValue.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${token.pctOfThreshold}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 mt-1 block text-right">{token.pctOfThreshold.toFixed(0)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Fee Revenue */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Fee Revenue</h2>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="rounded-2xl bg-white border border-gray-100 px-3 sm:px-5 py-4 sm:py-5">
              <div className="text-[9px] sm:text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Closed</div>
              <div className="text-gray-900 font-extrabold text-xl sm:text-2xl tabular-nums">{totalAccountsClosed.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 px-3 sm:px-5 py-4 sm:py-5">
              <div className="text-[9px] sm:text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Fees</div>
              <div className="text-green-600 font-extrabold text-xl sm:text-2xl tabular-nums leading-tight">{totalFeesCollected.toFixed(3)}<span className="text-xs sm:text-base font-medium ml-0.5">SOL</span></div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 px-3 sm:px-5 py-4 sm:py-5">
              <div className="text-[9px] sm:text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Pending</div>
              <div className="text-gray-900 font-extrabold text-xl sm:text-2xl tabular-nums leading-tight">{undistributedFeeSol.toFixed(3)}<span className="text-xs sm:text-base font-medium ml-0.5">SOL</span></div>
            </div>
          </div>
        </section>

        {/* Liquidation History */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Liquidations</h2>
          {recentLiquidations.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-6 text-gray-400 text-sm">
              No liquidations yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
              {/* Mobile: stacked cards */}
              <div className="sm:hidden divide-y divide-gray-100">
                {recentLiquidations.map((liq, i) => (
                  <div key={i} className="px-4 py-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-green-600 font-bold tabular-nums">{liq.solReceived.toFixed(4)} SOL</div>
                      <div className="text-gray-400 text-xs font-mono mt-0.5">{shortAddr(liq.mint)}</div>
                    </div>
                    <div className="text-gray-400 text-xs text-right">{formatDate(liq.date)}</div>
                  </div>
                ))}
              </div>
              {/* Desktop: table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 text-xs">
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Token</th>
                      <th className="text-right px-4 py-3">SOL Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLiquidations.map((liq, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 text-gray-500">{formatDate(liq.date)}</td>
                        <td className="px-4 py-3 font-mono text-gray-700">{shortAddr(liq.mint)}</td>
                        <td className="px-4 py-3 text-right text-green-600">{liq.solReceived.toFixed(6)} SOL</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Distribution Stats */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Distribution Stats</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Next Distribution</div>
              <div className="text-gray-900 font-bold text-lg">
                {nextDist ? formatDate(nextDist) : 'Not scheduled'}
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Your Est. Share</div>
              <div className={`font-bold text-lg ${estShare > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {estShare > 0 ? `~${estShare.toFixed(4)} SOL` : publicKey ? '—' : 'Connect wallet'}
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Total Distributed</div>
              <div className="text-gray-900 font-extrabold text-2xl tabular-nums">{totalSolDistributed.toFixed(4)}<span className="text-base font-medium ml-1">SOL</span></div>
            </div>
          </div>
        </section>

        {/* Your Stats */}
        {publicKey && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Your Stats</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white border border-gray-100 p-5">
                <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">SMELT Balance</div>
                <div className="text-gray-900 font-extrabold text-2xl tabular-nums">{smeltBalanceUi.toLocaleString()}<span className="text-base font-medium ml-1">SMELT</span></div>
              </div>
              <div className="rounded-2xl bg-white border border-gray-100 p-5">
                <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Pool Share</div>
                <div className="text-gray-900 font-extrabold text-2xl tabular-nums">
                  {sharePct > 0 ? `${sharePct.toFixed(3)}%` : '—'}
                </div>
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
