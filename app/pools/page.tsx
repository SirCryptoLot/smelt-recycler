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
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [data, setData] = useState<PoolsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [smeltBalance, setSmeltBalance] = useState(0n);
  const [smeltStaked, setSmeltStaked] = useState(0n);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const d = await fetchPoolsData();
      setData(d);
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
    if (!publicKey || !signTransaction) return;
    const wallet = { publicKey, signTransaction };
    fetchSmeltBalance(connection, publicKey).then(setSmeltBalance).catch(console.error);
    fetchStakeInfo(connection, publicKey, wallet as never)
      .then((info) => setSmeltStaked(info?.amountStaked ?? 0n))
      .catch(console.error);
  }, [publicKey, signTransaction, connection]);

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
  const smeltStakedUi = Number(smeltStaked) / 1e9;
  const unstaked = smeltBalanceUi - smeltStakedUi;
  const userWeight = unstaked * 1 + smeltStakedUi * 1.5;
  const estimatedShare = userWeight > 0 && undistributedSol > 0
    ? `~${(undistributedSol * 0.001).toFixed(4)} SOL`
    : '—';

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-gray-900">Pools</h1>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => refresh()}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 disabled:opacity-40 transition-all"
            >
              <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Vault Contents */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Vault Contents</h2>
          {tokens.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-6 text-gray-400 text-sm">
              Vault is empty — no tokens accumulated yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
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
                            <div
                              className="h-full rounded-full bg-green-600 transition-all"
                              style={{ width: `${token.pctOfThreshold}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 mt-1 block text-right">
                            {token.pctOfThreshold.toFixed(0)}%
                          </span>
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
          <h2 className="text-base font-semibold text-gray-900 mb-4">Fee Revenue</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">Accounts Closed</div>
              <div className="text-gray-900 font-medium">{totalAccountsClosed.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">Total Fees Collected</div>
              <div className="text-green-600 font-medium">{totalFeesCollected.toFixed(6)} SOL</div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">Pending Distribution</div>
              <div className="text-gray-900 font-medium">{undistributedFeeSol.toFixed(6)} SOL</div>
            </div>
          </div>
        </section>

        {/* Liquidation History */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Recent Liquidations</h2>
          {recentLiquidations.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-6 text-gray-400 text-sm">
              No liquidations yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
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
          <h2 className="text-base font-semibold text-gray-900 mb-4">Distribution Stats</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">Next Distribution</div>
              <div className="text-gray-900 font-medium">
                {nextDistDate ? formatDate(nextDistDate) : 'Not scheduled'}
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">Your Est. Share</div>
              <div className="text-green-600 font-medium">{estimatedShare}</div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">Total SOL Distributed</div>
              <div className="text-gray-900 font-medium">{totalSolDistributed.toFixed(4)} SOL</div>
            </div>
          </div>
        </section>

        {/* Your Stats */}
        {publicKey && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-4">Your Stats</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white border border-gray-200 p-5">
                <div className="text-xs text-gray-400 mb-1">SMELT Balance</div>
                <div className="text-gray-900 font-medium">{smeltBalanceUi.toLocaleString()} SMELT</div>
              </div>
              <div className="rounded-2xl bg-white border border-gray-200 p-5">
                <div className="text-xs text-gray-400 mb-1">Staked</div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium">{smeltStakedUi.toLocaleString()} SMELT</span>
                  {smeltStakedUi > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                      1.5× active
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
