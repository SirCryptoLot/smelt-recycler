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

// Each SPL token account occupies exactly 165 bytes of on-chain data.
const BYTES_PER_ACCOUNT = 165;

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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
    solDonated: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [totalAccountsClosed, setTotalAccountsClosed] = useState(0);
  const [donationEnabled, setDonationEnabled] = useState(false);
  const [donationPct, setDonationPct] = useState(25);

  useEffect(() => {
    setMounted(true);
    fetch('/api/stats', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setTotalAccountsClosed(d.fees?.totalAccountsClosed ?? 0); })
      .catch(() => {});
  }, []);

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
      const result = await recycleAccounts(selected, publicKey, signAllTransactions, connection, donationEnabled ? donationPct : 0);
      setRecycleResult(result);
      if (result.succeeded > 0) {
        const referredBy = typeof window !== 'undefined' ? localStorage.getItem('referredBy') ?? undefined : undefined;
        try {
          const res = await fetch('/api/recycle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: publicKey.toBase58(), accountsClosed: result.succeeded, referredBy, solDonated: result.solDonated > 0 ? result.solDonated : undefined }),
          });
          const body = await res.json().catch(() => ({})) as { error?: string; mintError?: string };
          if (!res.ok) {
            console.error('Recycle record failed:', body.error);
            setError(`Server error: ${body.error ?? 'unknown'}`);
          } else {
            refreshSmelt();
            if (body.mintError) {
              console.warn('SMELT mint failed (activity recorded):', body.mintError);
              setError(`SOL reclaimed ✓ · Stats updated ✓ · SMELT reward pending (${body.mintError.includes('insufficient') ? 'admin wallet needs SOL' : 'mint failed'})`);
            }
          }
        } catch {
          console.error('Recycle POST failed');
        }
      }
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction cancelled');
      setStatus('results');
    }
  }, [accounts, selectedKeys, publicKey, signAllTransactions, refreshSmelt, donationEnabled, donationPct]);

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

      {/* Stats banner — dark summary card inside results area (rendered below header) */}

      {/* Disconnected — landing hero */}
      {status === 'disconnected' && (
        <div className="flex-1 overflow-y-auto">
          {/* Hero */}
          <div className="flex flex-col items-center text-center px-6 pt-14 pb-10 sm:pt-20 sm:pb-16">
            <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-1.5 mb-7">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <span className="text-green-700 text-xs font-semibold tracking-wide">Live on Solana mainnet</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-[1.08] max-w-xs sm:max-w-lg">
              Reclaim SOL.<br />Clean the chain.
            </h1>
            <p className="text-gray-500 text-base sm:text-lg mt-5 max-w-sm leading-relaxed">
              Close empty token accounts, get your locked SOL back, and earn SMELT rewards for every account recycled.
            </p>

            {/* Live impact counter */}
            {totalAccountsClosed > 0 && (
              <div className="mt-8 flex items-stretch bg-white border border-green-100 rounded-2xl overflow-hidden shadow-sm shadow-green-100/50">
                <div className="px-6 py-4 text-center">
                  <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tabular-nums">{totalAccountsClosed.toLocaleString()}</div>
                  <div className="text-xs text-gray-400 font-medium mt-1">accounts recycled</div>
                </div>
                <div className="w-px bg-green-100 my-3" />
                <div className="px-6 py-4 text-center">
                  <div className="text-2xl sm:text-3xl font-extrabold text-green-600 tabular-nums">{fmtBytes(totalAccountsClosed * BYTES_PER_ACCOUNT)}</div>
                  <div className="text-xs text-gray-400 font-medium mt-1">freed from chain</div>
                </div>
              </div>
            )}

            {mounted && (
              <div className="mt-8 w-full max-w-xs">
                <WalletMultiButton className="!w-full !justify-center !text-base !font-bold !rounded-full !py-4 !h-auto !text-white !bg-green-600" />
              </div>
            )}
            <p className="text-gray-400 text-[13px] mt-3">Non-custodial · No fees on connect · Open source</p>
          </div>

          {/* How it works */}
          <div className="border-t border-gray-100 px-6 py-10 sm:py-14 max-w-2xl mx-auto w-full">
            <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-8 text-center">How it works</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6">
              {[
                {
                  step: '01',
                  title: 'Scan',
                  body: 'We read all your token accounts and flag ones with less than $0.10 in value — the dust Solana accumulates over time.',
                },
                {
                  step: '02',
                  title: 'Recycle',
                  body: 'Select the accounts to close. Tokens go to the platform vault. The ~0.002 SOL rent locked per account comes back to you.',
                },
                {
                  step: '03',
                  title: 'Earn',
                  body: 'You receive SMELT tokens as a reward for each recycled account — a share of the ecosystem you help clean.',
                },
              ].map(({ step, title, body }) => (
                <div key={step} className="flex flex-col gap-2.5">
                  <div className="text-[10px] font-bold tracking-widest text-green-600/60 uppercase">{step}</div>
                  <div className="text-gray-900 font-bold text-xl leading-tight">{title}</div>
                  <div className="text-gray-500 text-sm leading-relaxed">{body}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Why it matters */}
          <div className="bg-white border-y border-gray-100 px-6 py-8 sm:py-10">
            <div className="max-w-2xl mx-auto">
              <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-4">Why it matters</div>
              <p className="text-gray-800 text-base sm:text-lg font-medium leading-relaxed">
                Every open token account occupies a slot in Solana&rsquo;s global state. Validators must load all accounts on every block — the more unused accounts exist, the heavier the chain becomes for everyone.
              </p>
              <p className="text-gray-500 text-sm mt-3 leading-relaxed">
                Recycler is a public good. You get your rent back. The chain gets a little lighter.
              </p>
            </div>
          </div>

          <div className="h-16" />
        </div>
      )}

      {/* Scanning */}
      {status === 'scanning' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-2 border-gray-200 border-t-green-600 rounded-full animate-spin" />
          <div className="text-center">
            <div className="text-gray-900 font-semibold">Scanning accounts…</div>
            <div className="text-gray-400 text-sm mt-1">Fetching prices from Jupiter</div>
          </div>
        </div>
      )}

      {/* Results */}
      {status === 'results' && (
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Header row */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[11px] font-extrabold flex-shrink-0">{accounts.length}</span>
              <span className="text-gray-600 text-sm font-medium">dust account{accounts.length !== 1 ? 's' : ''} found</span>
              <button onClick={scan} title="Refresh" className="text-gray-300 hover:text-green-600 transition-colors p-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <button
              onClick={toggleAll}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                allSelected
                  ? 'bg-green-600 text-white border-green-600'
                  : 'border-green-200 text-green-600 hover:bg-green-50'
              }`}
            >
              {allSelected ? '✓ All selected' : 'Select all'}
            </button>
          </div>

          {error && (
            <div className="mx-4 mt-3 flex-shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm">{error}</div>
          )}

          {/* Stats summary card */}
          <div className="mx-3 mt-3 mb-1 rounded-2xl bg-gray-950 px-4 py-4 flex items-center gap-3 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="text-gray-500 text-[9px] uppercase tracking-widest font-bold mb-0.5">Reclaiming</div>
              <div className="text-white font-extrabold text-2xl tabular-nums leading-tight">
                {sol.toFixed(4)}<span className="text-gray-500 text-sm font-semibold ml-1">SOL</span>
              </div>
              <div className="text-gray-600 text-[11px] mt-0.5">{selected.length} of {accounts.length} selected</div>
            </div>
            <div className="w-px h-12 bg-white/10 flex-shrink-0" />
            <div className="text-right flex-shrink-0">
              <div className="text-gray-500 text-[9px] uppercase tracking-widest font-bold mb-0.5">Earn</div>
              <div className="text-green-400 font-extrabold text-lg tabular-nums leading-tight">+{smeltReward.toLocaleString()}</div>
              <div className="text-gray-600 text-[10px]">SMELT</div>
            </div>
            <div className="w-px h-12 bg-white/10 flex-shrink-0" />
            <div className="text-right flex-shrink-0">
              <div className="text-gray-500 text-[9px] uppercase tracking-widest font-bold mb-0.5">Free</div>
              <div className="text-gray-300 font-extrabold text-lg tabular-nums leading-tight">{fmtBytes(selected.length * BYTES_PER_ACCOUNT)}</div>
              <div className="text-gray-600 text-[10px]">on-chain</div>
            </div>
          </div>

          {/* Account grid */}
          <div className="flex-1 overflow-y-auto px-3 py-2 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
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
                  className={`relative rounded-2xl border p-3 cursor-pointer select-none transition-all ${
                    isSelected
                      ? 'border-green-200 bg-white shadow-sm shadow-green-100/50'
                      : 'border-gray-100 bg-white/60 opacity-40 hover:opacity-65'
                  }`}
                >
                  {/* Checkbox top-right */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(key)}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-2.5 right-2.5 accent-green-600 w-4 h-4 cursor-pointer"
                  />
                  {/* Avatar + symbol */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>{initials}</div>
                    <div className="min-w-0 flex-1 pr-5">
                      <div className="text-gray-900 font-bold text-xs truncate leading-tight">{name}</div>
                      {meta?.symbol && <div className="text-gray-400 text-[10px] font-mono truncate">{meta.symbol}</div>}
                    </div>
                  </div>
                  {/* Value row */}
                  <div className="flex items-center justify-between">
                    {account.balance === 0 ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">EMPTY</span>
                    ) : (
                      <span className="text-gray-800 font-bold text-xs tabular-nums">
                        {account.usdValue > 0.0001 ? `$${account.usdValue.toFixed(4)}` : '<$0.01'}
                      </span>
                    )}
                    <span className="text-gray-300 text-[10px] font-mono">~0.002◎</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 sm:px-6 py-5 border-t border-gray-100 flex-shrink-0 bg-white space-y-4">
            {/* Donation toggle */}
            <div className="bg-[#f0faf4] border border-green-100 rounded-2xl px-4 py-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={donationEnabled}
                  onChange={(e) => setDonationEnabled(e.target.checked)}
                  className="accent-green-600 w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700">Donate reclaimed SOL to ecosystem</span>
              </label>
              {donationEnabled && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    {([25, 50, 100] as const).map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setDonationPct(pct)}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                          donationPct === pct
                            ? 'bg-green-600 text-white'
                            : 'border border-green-200 text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 text-center">
                    Keep <span className="font-semibold text-gray-700">{(sol * (1 - donationPct / 100)).toFixed(4)} SOL</span>
                    {' · '}
                    Donate <span className="font-semibold text-green-700">{(sol * donationPct / 100).toFixed(4)} SOL</span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={recycle}
              disabled={!signAllTransactions || selected.length === 0}
              className="w-full bg-green-600 hover:bg-green-500 active:scale-[0.98] disabled:opacity-25 disabled:cursor-not-allowed text-white font-bold py-4 rounded-full transition-all text-base shadow-lg shadow-green-200"
            >
              ♻ Recycle {selected.length} account{selected.length !== 1 ? 's' : ''}
              <span className="font-normal opacity-80 ml-1">
                · {donationEnabled
                  ? `keep ${(sol * (1 - donationPct / 100)).toFixed(4)} SOL`
                  : `get ${sol.toFixed(4)} SOL`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Recycling */}
      {status === 'recycling' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-2 border-gray-200 border-t-green-600 rounded-full animate-spin" />
          <div className="text-center">
            <div className="text-gray-900 font-semibold">Recycling {selected.length} account{selected.length !== 1 ? 's' : ''}…</div>
            <div className="text-gray-400 text-sm mt-1">Approve in Phantom, then wait for confirmation</div>
          </div>
        </div>
      )}

      {/* Success */}
      {status === 'success' && recycleResult && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl">♻</div>
          <div className="text-center">
            <div className="text-gray-900 font-extrabold text-4xl tracking-tight tabular-nums">{recycleResult.solReclaimed.toFixed(4)}</div>
            <div className="text-gray-400 text-base mt-1">SOL reclaimed from {recycleResult.succeeded} account{recycleResult.succeeded !== 1 ? 's' : ''}</div>
            {recycleResult.failed > 0 && <div className="text-amber-500 text-sm mt-2">{recycleResult.failed} account{recycleResult.failed !== 1 ? 's' : ''} failed</div>}
            {(recycleResult.solDonated ?? 0) > 0 && (
              <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-100 rounded-full px-4 py-1.5 mt-2">
                <span className="text-green-600 text-sm font-semibold">{recycleResult.solDonated.toFixed(4)} SOL donated to ecosystem</span>
              </div>
            )}
          </div>
          {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-red-600 text-sm max-w-xs text-center">{error}</div>}
          <div className="w-full max-w-xs flex flex-col gap-2.5">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just recycled ${recycleResult.succeeded} dust account${recycleResult.succeeded !== 1 ? 's' : ''} on Solana and reclaimed ${recycleResult.solReclaimed.toFixed(4)} SOL ♻️\n\nClean your wallet → earn SMELT rewards\nhttps://smelt-recycler-production.up.railway.app`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-black hover:bg-gray-900 active:scale-[0.98] text-white font-semibold text-sm rounded-full py-3.5 transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.26 5.632 5.904-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Share on X
            </a>
            <button onClick={scan} className="w-full bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-full py-3.5 hover:border-gray-300 hover:bg-gray-50 transition-all">Scan again</button>
          </div>
        </div>
      )}

      {/* Empty */}
      {status === 'empty' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-10">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">✅</div>
          <div className="text-center">
            <div className="text-gray-900 font-extrabold text-2xl tracking-tight">Wallet is clean</div>
            <div className="text-gray-400 text-sm mt-1.5">No dust accounts found. Nice work.</div>
          </div>
          <div className="w-full max-w-xs flex flex-col gap-3">
            <a href="/stake" className="flex items-center justify-between bg-green-600 hover:bg-green-500 active:scale-[0.99] transition-all text-white rounded-2xl px-5 py-4 group">
              <div>
                <div className="font-bold text-sm">Stake your SMELT</div>
                <div className="text-green-200 text-xs mt-0.5">Earn SOL rewards every epoch</div>
              </div>
              <span className="text-white/60 group-hover:translate-x-0.5 transition-transform text-lg">→</span>
            </a>
            <a href="/swap" className="flex items-center justify-between bg-white border border-gray-100 shadow-sm hover:border-gray-200 active:scale-[0.99] transition-all rounded-2xl px-5 py-4 group">
              <div>
                <div className="font-bold text-sm text-gray-800">Buy more SMELT</div>
                <div className="text-gray-400 text-xs mt-0.5">Stack while your wallet stays clean</div>
              </div>
              <span className="text-gray-300 group-hover:translate-x-0.5 transition-transform text-lg">→</span>
            </a>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-5 sm:p-8">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 max-w-sm w-full text-center">
            <div className="text-red-600 font-semibold mb-1">Scan failed</div>
            <div className="text-red-400 text-sm">{error}</div>
          </div>
          <button onClick={scan} className="border border-gray-200 text-gray-400 text-sm rounded-xl px-5 py-2.5 hover:border-gray-300 hover:text-gray-600 transition-all">Try again</button>
        </div>
      )}
    </div>
  );
}
