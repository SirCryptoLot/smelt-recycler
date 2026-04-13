// app/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  getTrashAccounts,
  solToReclaim,
  TrashAccount,
  connection,
  fetchTokenMetas,
  TokenMeta,
} from '@/lib/solana';
import { recycleAccounts } from '@/lib/recycle';
import { useSmelt } from '@/lib/smelt-context';
import { currentSmeltPerAccount } from '@/lib/constants';

type Status = 'disconnected' | 'scanning' | 'results' | 'empty' | 'error' | 'recycling' | 'success';

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-sky-500', 'bg-teal-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-orange-500', 'bg-rose-500',
  'bg-pink-500', 'bg-purple-500', 'bg-indigo-500', 'bg-cyan-500',
];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function Home() {
  const { publicKey, connected, signAllTransactions } = useWallet();
  const { refreshSmelt } = useSmelt();
  const [status, setStatus] = useState<Status>('disconnected');
  const [accounts, setAccounts] = useState<TrashAccount[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [tokenMetas, setTokenMetas] = useState<Record<string, TokenMeta>>({});
  const [error, setError] = useState('');
  const [recycleResult, setRecycleResult] = useState<{
    succeeded: number;
    failed: number;
    solReclaimed: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const scan = useCallback(async () => {
    setStatus('scanning');
    setError('');
    setTokenMetas({});
    try {
      if (!publicKey) return;
      const result = await getTrashAccounts(publicKey);
      if (result.length === 0) {
        setStatus('empty');
      } else {
        setAccounts(result);
        setSelectedKeys(new Set(result.map((a) => a.pubkey.toBase58())));
        setStatus('results');
        fetchTokenMetas(result.map((a) => a.mint.toBase58())).then(setTokenMetas);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }, [publicKey]);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedKeys((prev) =>
      prev.size === accounts.length
        ? new Set()
        : new Set(accounts.map((a) => a.pubkey.toBase58()))
    );
  }, [accounts]);

  const recycle = useCallback(async () => {
    if (!publicKey || !signAllTransactions) return;
    const selected = accounts.filter((a) => selectedKeys.has(a.pubkey.toBase58()));
    if (selected.length === 0) return;
    setStatus('recycling');
    try {
      const result = await recycleAccounts(selected, publicKey, signAllTransactions, connection);
      setRecycleResult(result);
      if (result.succeeded > 0) {
        const referredBy = typeof window !== 'undefined' ? localStorage.getItem('referredBy') ?? undefined : undefined;
        fetch('/api/recycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: publicKey.toBase58(), accountsClosed: result.succeeded, referredBy }),
        })
          .then(() => refreshSmelt())
          .catch(() => {});
      }
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction cancelled');
      setStatus('results');
    }
  }, [accounts, selectedKeys, publicKey, signAllTransactions, refreshSmelt]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setStatus('disconnected');
      setAccounts([]);
      setSelectedKeys(new Set());
      return;
    }
    scan();
  }, [connected, publicKey, scan]);

  const selected = accounts.filter((a) => selectedKeys.has(a.pubkey.toBase58()));
  const sol = solToReclaim(selected.length);
  const allSelected = accounts.length > 0 && selectedKeys.size === accounts.length;
  const totalUsd = selected.reduce((s, a) => s + a.usdValue, 0);
  const smeltReward = selected.length * currentSmeltPerAccount();

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Stats strip */}
      {status === 'results' && (
        <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-white/5 flex-shrink-0">
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-2.5 col-span-1">
            <div className="text-[9px] font-semibold tracking-widest text-emerald-500/50 uppercase mb-0.5">SOL to reclaim</div>
            <div className="text-white font-bold text-lg tracking-tight">{sol.toFixed(4)}</div>
            <div className="text-white/25 text-[10px] mt-0.5">{selected.length}/{accounts.length} selected</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 col-span-1">
            <div className="text-[9px] font-semibold tracking-widest text-white/25 uppercase mb-0.5">SMELT reward</div>
            <div className="text-emerald-400 font-bold text-lg">+{smeltReward.toLocaleString()}</div>
            {totalUsd > 0 && <div className="text-white/25 text-[10px] mt-0.5">dust ${totalUsd.toFixed(2)}</div>}
          </div>
        </div>
      )}

      {/* Disconnected */}
      {status === 'disconnected' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 sm:p-10">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center text-3xl">🔌</div>
          <div className="text-center">
            <div className="text-white font-semibold text-lg">Connect your wallet</div>
            <div className="text-white/30 text-sm mt-1.5 max-w-xs">Connect Phantom to scan for dust token accounts and reclaim rent SOL</div>
          </div>
          {mounted && (
            <WalletMultiButton className="!bg-emerald-500 !text-white !font-semibold !text-sm !rounded-xl !px-6 !py-2.5" />
          )}
        </div>
      )}

      {/* Scanning */}
      {status === 'scanning' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
          <div className="text-center">
            <div className="text-white font-semibold">Scanning accounts…</div>
            <div className="text-white/30 text-sm mt-1">Fetching prices from Jupiter</div>
          </div>
        </div>
      )}

      {/* Results */}
      {status === 'results' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/5 flex-shrink-0">
            <span className="text-white/30 text-xs font-semibold tracking-widest uppercase">
              {accounts.length} trash account{accounts.length !== 1 ? 's' : ''}
            </span>
            <button onClick={toggleAll} className="text-white/30 text-xs hover:text-emerald-400 transition-colors">
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {error && (
            <div className="mx-6 mt-4 flex-shrink-0 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-red-400/70 text-sm">{error}</div>
          )}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-2">
            {accounts.map((account) => {
              const key = account.pubkey.toBase58();
              const mintStr = account.mint.toBase58();
              const meta: TokenMeta | undefined = tokenMetas[mintStr];
              const isSelected = selectedKeys.has(key);
              const symbol = meta?.symbol || '???';
              const name = meta?.name || 'Unknown token';
              const initials = symbol !== '???' ? symbol.slice(0, 2).toUpperCase() : mintStr.slice(0, 2).toUpperCase();
              const color = avatarColor(mintStr);
              return (
                <div
                  key={key}
                  onClick={() => toggleSelect(key)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 cursor-pointer select-none transition-all ${
                    isSelected
                      ? 'border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/8'
                      : 'border-white/4 bg-white/[0.02] opacity-40 hover:opacity-60'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>{initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-white text-sm font-semibold truncate">{name}</span>
                      {meta?.symbol && <span className="text-white/30 text-xs flex-shrink-0 font-mono">{meta.symbol}</span>}
                    </div>
                    <div className="text-white/20 text-[11px] font-mono mt-0.5">{shortAddr(mintStr)}</div>
                  </div>
                  <div className="text-right flex-shrink-0 mr-2">
                    {account.balance === 0 ? (
                      <div className="inline-flex items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400/70 tracking-wide">EMPTY</div>
                    ) : (
                      <>
                        <div className="text-white/70 text-sm font-semibold tabular-nums">{account.usdValue > 0.0001 ? `$${account.usdValue.toFixed(4)}` : '<$0.01'}</div>
                        <div className="text-white/20 text-[11px] mt-0.5 tabular-nums">{account.balance.toLocaleString()} tkn</div>
                      </>
                    )}
                  </div>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(key)} onClick={(e) => e.stopPropagation()} className="accent-emerald-500 w-4 h-4 flex-shrink-0 cursor-pointer" />
                </div>
              );
            })}
          </div>
          <div className="px-4 sm:px-6 py-4 border-t border-white/5 flex-shrink-0 bg-[#060f0d]">
            <button
              onClick={recycle}
              disabled={!signAllTransactions || selected.length === 0}
              className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-25 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all text-sm"
            >
              ♻ Recycle {selected.length} account{selected.length !== 1 ? 's' : ''} · reclaim {sol.toFixed(4)} SOL
            </button>
          </div>
        </div>
      )}

      {/* Recycling */}
      {status === 'recycling' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
          <div className="text-center">
            <div className="text-white font-semibold">Recycling {selected.length} account{selected.length !== 1 ? 's' : ''}…</div>
            <div className="text-white/30 text-sm mt-1">Approve in Phantom, then wait for confirmation</div>
          </div>
        </div>
      )}

      {/* Success */}
      {status === 'success' && recycleResult && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center text-3xl">✅</div>
          <div className="text-center">
            <div className="text-white font-bold text-2xl tracking-tight">~{recycleResult.solReclaimed.toFixed(4)} SOL</div>
            <div className="text-white/30 text-sm mt-1.5">reclaimed from {recycleResult.succeeded} account{recycleResult.succeeded !== 1 ? 's' : ''}</div>
            {recycleResult.failed > 0 && <div className="text-amber-400/60 text-sm mt-1">{recycleResult.failed} failed</div>}
          </div>
          <button onClick={scan} className="border border-white/8 text-white/40 text-sm rounded-xl px-5 py-2.5 hover:border-white/15 hover:text-white/60 transition-all">Scan again</button>
        </div>
      )}

      {/* Empty */}
      {status === 'empty' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center text-3xl">✅</div>
          <div className="text-center">
            <div className="text-white font-semibold text-lg">Nothing to recycle</div>
            <div className="text-white/30 text-sm mt-1">Your wallet is clean.</div>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-5 sm:p-8">
          <div className="rounded-2xl border border-red-500/15 bg-red-500/5 px-6 py-5 max-w-sm w-full text-center">
            <div className="text-red-400 font-semibold mb-1">Scan failed</div>
            <div className="text-red-400/50 text-sm">{error}</div>
          </div>
          <button onClick={scan} className="border border-white/8 text-white/40 text-sm rounded-xl px-5 py-2.5 hover:border-white/15 hover:text-white/60 transition-all">Try again</button>
        </div>
      )}
    </div>
  );
}
