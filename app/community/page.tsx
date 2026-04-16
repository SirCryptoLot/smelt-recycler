// app/community/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { SystemProgram, Transaction } from '@solana/web3.js';
import { EcosystemData } from '@/lib/ecosystem';
import { VAULT_PUBKEY } from '@/lib/constants';

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

function shortAddr(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }

export default function CommunityPage() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [eco, setEco] = useState<EcosystemData | null>(null);
  const [lb, setLb] = useState<LeaderboardData | null>(null);
  const [tab, setTab] = useState<Tab>('weekly');
  const [loading, setLoading] = useState(true);
  const [totalSolDonated, setTotalSolDonated] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Donate state
  const [donateAmount, setDonateAmount] = useState('');
  const [donating, setDonating] = useState(false);
  const [donateSuccess, setDonateSuccess] = useState(false);
  const [donateError, setDonateError] = useState('');

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ecoRes, lbRes, donationsRes] = await Promise.all([
        fetch('/api/ecosystem', { cache: 'no-store' }),
        fetch('/api/leaderboard', { cache: 'no-store' }),
        fetch('/api/donations', { cache: 'no-store' }),
      ]);
      if (ecoRes.ok) setEco(await ecoRes.json() as EcosystemData);
      if (lbRes.ok) setLb(await lbRes.json() as LeaderboardData);
      if (donationsRes.ok) {
        const d = await donationsRes.json() as { totalSolDonated: number };
        setTotalSolDonated(d.totalSolDonated);
      }
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

  async function handleDonate() {
    if (!publicKey || !signTransaction) return;
    const amountSol = parseFloat(donateAmount);
    if (isNaN(amountSol) || amountSol <= 0) return;
    setDonating(true);
    setDonateError('');
    setDonateSuccess(false);
    try {
      const lamports = Math.round(amountSol * 1e9);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: VAULT_PUBKEY,
          lamports,
        })
      );
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      await fetch('/api/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58(), amount: amountSol, txSignature: sig }),
      });
      setDonateSuccess(true);
      setDonateAmount('');
      setTotalSolDonated(prev => prev + amountSol);
      setTimeout(() => setDonateSuccess(false), 4000);
    } catch (err) {
      setDonateError(err instanceof Error ? err.message : 'Donation failed');
    } finally {
      setDonating(false);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* Page heading */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Community</h1>
          <p className="text-gray-400 text-sm mt-1">Ecosystem health, leaderboard &amp; donations</p>
        </div>

        {/* Ecosystem Health */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-5">Ecosystem Health</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Wallets cleaned', value: (eco?.totalWallets ?? 0).toLocaleString(), accent: false },
              { label: 'Accounts closed', value: (eco?.totalAccountsClosed ?? 0).toLocaleString(), accent: false },
              { label: 'SOL unlocked', value: `${(eco?.totalSolReclaimed ?? 0).toFixed(2)} SOL`, accent: false },
              { label: 'SMELT minted', value: (eco?.totalSmeltMinted ?? 0).toLocaleString(), accent: true },
              { label: 'SOL donated', value: `${totalSolDonated.toFixed(4)} SOL`, accent: true },
            ].map(({ label, value, accent }) => (
              <div key={label} className="rounded-2xl bg-white border border-gray-100 px-3 sm:px-4 py-4">
                <div className="text-[9px] sm:text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">{label}</div>
                <div className={`font-extrabold text-lg sm:text-xl tabular-nums leading-tight ${accent ? 'text-green-600' : 'text-gray-900'}`}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Donate */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-5">Donate to the pool</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500 mb-4">
              Send SOL directly to the distribution pool. It will be included in the next epoch&apos;s distribution to stakers.
            </p>
            <div className="flex gap-2 mb-3">
              {[0.1, 0.5, 1].map(amt => (
                <button
                  key={amt}
                  onClick={() => setDonateAmount(String(amt))}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                    donateAmount === String(amt)
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                  }`}
                >
                  {amt} SOL
                </button>
              ))}
            </div>
            <input
              type="number"
              min="0.001"
              step="0.001"
              placeholder="Custom amount (SOL)"
              value={donateAmount}
              onChange={e => setDonateAmount(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 mb-3 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100"
            />
            {!publicKey ? (
              <div className="text-xs text-gray-400 text-center py-2">Connect your wallet to donate.</div>
            ) : (
              <button
                onClick={handleDonate}
                disabled={donating || !donateAmount || Number(donateAmount) <= 0}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
              >
                {donating ? 'Sending…' : 'Donate'}
              </button>
            )}
            {donateSuccess && (
              <div className="mt-3 text-sm text-green-700 font-semibold text-center">
                Thank you! Your donation was recorded.
              </div>
            )}
            {donateError && (
              <div className="mt-3 text-sm text-red-500 text-center">{donateError}</div>
            )}
          </div>
        </section>

        {/* Leaderboard */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">Leaderboard</h2>
            {tab === 'weekly' && lb?.weekly.since && (
              <span className="text-xs text-gray-400">
                Since {new Date(lb.weekly.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-5 w-fit">
            {(['weekly', 'allTime'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${tab === t ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {t === 'weekly' ? 'This week' : 'All-time'}
              </button>
            ))}
          </div>

          {currentEntries.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-6 text-gray-400 text-sm">
              No recycling activity yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
              {/* Mobile */}
              <div className="sm:hidden divide-y divide-gray-100">
                {currentEntries.map((entry, i) => {
                  const isUser = entry.wallet === userWallet;
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                  return (
                    <div key={entry.wallet} className={`px-4 py-3.5 flex items-center gap-3 ${isUser ? 'bg-green-50' : ''}`}>
                      <span className="text-base w-6 text-center flex-shrink-0">{medal ?? <span className="text-gray-400 text-sm font-medium">{i + 1}</span>}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-700">{shortAddr(entry.wallet)}</span>
                          {isUser && <span className="text-green-700 text-[10px] font-bold bg-green-100 px-1.5 py-0.5 rounded-full">you</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{entry.solReclaimed.toFixed(4)} SOL reclaimed</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-gray-900 font-bold tabular-nums">{entry.accounts}</div>
                        <div className="text-[10px] text-gray-400">accounts</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop */}
              <table className="hidden sm:table w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-xs">
                    <th className="text-left px-4 py-3 w-8">#</th>
                    <th className="text-left px-4 py-3">Wallet</th>
                    <th className="text-right px-4 py-3">Accounts</th>
                    <th className="text-right px-4 py-3">SOL reclaimed</th>
                  </tr>
                </thead>
                <tbody>
                  {currentEntries.map((entry, i) => {
                    const isUser = entry.wallet === userWallet;
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                    return (
                      <tr key={entry.wallet} className={`border-b border-gray-50 last:border-0 ${isUser ? 'bg-green-50' : ''}`}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{medal ?? i + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                          {shortAddr(entry.wallet)}
                          {isUser && <span className="ml-2 text-green-700 text-[10px] font-semibold bg-green-100 px-1.5 py-0.5 rounded">you</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 font-semibold">{entry.accounts}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{entry.solReclaimed.toFixed(4)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {userRank === -1 && userWallet && (
                <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between gap-3 text-xs bg-green-50">
                  <span className="text-gray-400">Not in top 20</span>
                  <span className="text-gray-500 font-mono">{shortAddr(userWallet)}</span>
                  <span className="text-green-700 text-[10px] bg-green-100 px-1.5 py-0.5 rounded font-semibold">you</span>
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
