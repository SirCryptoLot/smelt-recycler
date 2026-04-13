// app/swap/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { getTrashAccounts, solToReclaim, TrashAccount, connection } from '@/lib/solana';
import { recycleAccounts } from '@/lib/recycle';
import { getSmeltQuote, getSmeltPrice, buildSwapTransaction, executeSwap, JupiterQuote } from '@/lib/jupiter-swap';
import { useSmelt } from '@/lib/smelt-context';
import { SMELT_MINT } from '@/lib/constants';

type Mode = 'dust' | 'buy';
type DustStatus = 'idle' | 'scanning' | 'ready' | 'step1' | 'step2' | 'done' | 'error';

declare global {
  interface Window {
    Jupiter?: {
      init: (config: Record<string, unknown>) => void;
    };
  }
}

export default function SwapPage() {
  const { publicKey, connected, signAllTransactions, signTransaction } = useWallet();
  const { refreshSmelt } = useSmelt();

  const [mode, setMode] = useState<Mode>('dust');
  const [dustStatus, setDustStatus] = useState<DustStatus>('idle');
  const [accounts, setAccounts] = useState<TrashAccount[]>([]);
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [smeltPrice, setSmeltPrice] = useState<number | null>(null);
  const [nav, setNav] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [txSig, setTxSig] = useState('');
  const jupiterRef = useRef<HTMLDivElement>(null);
  const [jupiterLoaded, setJupiterLoaded] = useState(false);

  // Fetch SMELT market price + pending SOL for Buy mode header
  useEffect(() => {
    getSmeltPrice().then(setSmeltPrice).catch(() => {});
    fetch('/api/stats', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        const pending = (d.liquidations?.undistributedSol ?? 0) + (d.fees?.undistributedSol ?? 0);
        setNav(pending);
      })
      .catch(() => {});
  }, []);

  // Load Jupiter Terminal for Buy mode
  useEffect(() => {
    if (mode !== 'buy' || jupiterLoaded) return;
    const script = document.createElement('script');
    script.src = 'https://terminal.jup.ag/main-v3.js';
    script.setAttribute('data-preload', '');
    script.onload = () => {
      setJupiterLoaded(true);
      if (window.Jupiter && jupiterRef.current) {
        window.Jupiter.init({
          displayMode: 'integrated',
          integratedTargetId: 'jupiter-terminal',
          endpoint: 'https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15',
          defaultExplorer: 'Solscan',
          formProps: {
            fixedOutputMint: true,
            initialOutputMint: SMELT_MINT.toBase58(),
          },
        });
      }
    };
    document.head.appendChild(script);
  }, [mode, jupiterLoaded]);

  // Scan dust accounts
  const scan = useCallback(async () => {
    if (!publicKey) return;
    setDustStatus('scanning');
    setError('');
    try {
      const result = await getTrashAccounts(publicKey);
      setAccounts(result);
      if (result.length > 0) {
        const lamports = Math.floor(solToReclaim(result.length) * 1e9);
        const q = await getSmeltQuote(lamports);
        setQuote(q);
      }
      setDustStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setDustStatus('error');
    }
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey && mode === 'dust') scan();
  }, [connected, publicKey, mode, scan]);

  // Refresh quote every 10s
  useEffect(() => {
    if (dustStatus !== 'ready' || accounts.length === 0) return;
    const id = setInterval(async () => {
      const lamports = Math.floor(solToReclaim(accounts.length) * 1e9);
      const q = await getSmeltQuote(lamports);
      if (q) setQuote(q);
    }, 10_000);
    return () => clearInterval(id);
  }, [dustStatus, accounts]);

  const convertToSmelt = useCallback(async () => {
    if (!publicKey || !signAllTransactions || !signTransaction || accounts.length === 0) return;

    setDustStatus('step1');
    setError('');
    try {
      // Step 1: recycle accounts → get SOL
      const result = await recycleAccounts(accounts, publicKey, signAllTransactions, connection);
      if (result.succeeded === 0) throw new Error('No accounts were closed');

      // Notify backend (for SMELT minting + leaderboard)
      const referredBy = typeof window !== 'undefined' ? localStorage.getItem('referredBy') ?? undefined : undefined;
      await fetch('/api/recycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58(), accountsClosed: result.succeeded, referredBy }),
      }).catch(() => {});

      setDustStatus('step2');

      // Step 2: swap reclaimed SOL → SMELT
      const lamports = Math.floor(result.solReclaimed * 1e9);
      const freshQuote = await getSmeltQuote(lamports);
      if (!freshQuote) throw new Error('Could not get swap quote — your SOL was kept in wallet');

      const swapTx = await buildSwapTransaction(freshQuote, publicKey.toBase58());
      const sig = await executeSwap(swapTx, signTransaction as (tx: VersionedTransaction) => Promise<VersionedTransaction>);
      setTxSig(sig);
      setDustStatus('done');
      refreshSmelt();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setDustStatus('error');
    }
  }, [publicKey, signAllTransactions, signTransaction, accounts, refreshSmelt]);

  const estimatedSmelt = quote ? Math.floor(Number(quote.outAmount) / 1e9) : 0;
  const sol = solToReclaim(accounts.length);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Mode toggle */}
        <div className="flex rounded-xl border border-white/10 overflow-hidden">
          <button
            onClick={() => setMode('dust')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${mode === 'dust' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            ♻ Dust → SMELT
          </button>
          <button
            onClick={() => setMode('buy')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${mode === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            ⇄ Buy SMELT
          </button>
        </div>

        {/* ── DUST MODE ── */}
        {mode === 'dust' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-5">
            <div>
              <h2 className="text-zinc-100 font-semibold text-base mb-1">Convert dust directly to SMELT</h2>
              <p className="text-zinc-500 text-xs">Close your dust accounts, reclaim SOL, and swap it to SMELT — in two steps.</p>
            </div>

            {!connected && (
              <div className="text-zinc-500 text-sm">Connect your wallet to scan for dust accounts.</div>
            )}

            {connected && dustStatus === 'scanning' && (
              <div className="flex items-center gap-3 text-zinc-400 text-sm">
                <div className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin flex-shrink-0" />
                Scanning wallet…
              </div>
            )}

            {connected && dustStatus === 'ready' && accounts.length === 0 && (
              <div className="text-zinc-500 text-sm">No dust accounts found.</div>
            )}

            {connected && (dustStatus === 'ready' || dustStatus === 'step1' || dustStatus === 'step2') && accounts.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/5 border border-white/5 px-3 py-2.5">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">Accounts</div>
                    <div className="text-zinc-100 font-bold">{accounts.length}</div>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/5 px-3 py-2.5">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">SOL to reclaim</div>
                    <div className="text-zinc-100 font-bold">{sol.toFixed(4)}</div>
                  </div>
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 px-3 py-2.5 col-span-2">
                    <div className="text-[10px] text-emerald-500/50 uppercase tracking-widest mb-0.5">Est. SMELT received</div>
                    <div className="text-emerald-400 font-bold text-lg">
                      {quote ? `~${estimatedSmelt.toLocaleString()} SMELT` : '—'}
                    </div>
                    {quote && <div className="text-zinc-600 text-[10px] mt-0.5">via Jupiter · updates every 10s</div>}
                  </div>
                </div>

                {/* Step progress */}
                <div className="space-y-2">
                  {(() => {
                    const s = dustStatus as DustStatus;
                    return [
                      { label: 'Step 1: Close accounts + reclaim SOL', active: s === 'step1', done: s === 'step2' || s === 'done' },
                      { label: 'Step 2: Swap SOL → SMELT via Jupiter', active: s === 'step2', done: s === 'done' },
                    ];
                  })().map(({ label, active, done }) => (
                    <div key={label} className="flex items-center gap-2 text-xs">
                      {done
                        ? <span className="text-emerald-400 font-bold">✓</span>
                        : active
                          ? <div className="w-3 h-3 border border-emerald-700 border-t-emerald-400 rounded-full animate-spin flex-shrink-0" />
                          : <span className="text-zinc-700">·</span>}
                      <span className={done ? 'text-emerald-400' : active ? 'text-zinc-200' : 'text-zinc-600'}>{label}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={convertToSmelt}
                  disabled={!quote || dustStatus === 'step1' || dustStatus === 'step2'}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all text-sm"
                >
                  {dustStatus === 'step1' ? 'Closing accounts…' : dustStatus === 'step2' ? 'Swapping to SMELT…' : 'Convert to SMELT'}
                </button>
              </>
            )}

            {dustStatus === 'done' && (
              <div className="text-center space-y-3">
                <div className="text-4xl">✅</div>
                <div className="text-emerald-400 font-bold">SMELT received!</div>
                {txSig && (
                  <a
                    href={`https://solscan.io/tx/${txSig}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-500 hover:text-zinc-300 underline"
                  >
                    View on Solscan
                  </a>
                )}
                <button onClick={scan} className="text-xs text-zinc-500 hover:text-zinc-300 underline block mx-auto">
                  Scan again
                </button>
              </div>
            )}

            {dustStatus === 'error' && (
              <div className="rounded-xl bg-red-500/5 border border-red-500/20 px-4 py-3 text-red-400/80 text-sm">
                {error}
                <button onClick={scan} className="block mt-2 text-xs underline text-red-400/50 hover:text-red-400/80">Try again</button>
              </div>
            )}
          </div>
        )}

        {/* ── BUY MODE ── */}
        {mode === 'buy' && (
          <div className="space-y-4">
            {/* Price comparison */}
            {smeltPrice !== null && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Market price</div>
                  <div className="text-zinc-100 font-bold">{smeltPrice.toFixed(8)} SOL</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Pending pool</div>
                  <div className="text-indigo-400 font-bold">{nav?.toFixed(4) ?? '—'} SOL</div>
                </div>
              </div>
            )}

            {/* Jupiter Terminal */}
            <div className="rounded-2xl border border-white/10 overflow-hidden min-h-[420px]">
              <div id="jupiter-terminal" ref={jupiterRef} className="w-full min-h-[420px]" />
              {!jupiterLoaded && (
                <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
                  Loading Jupiter…
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
