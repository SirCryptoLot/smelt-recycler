// app/foundry/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  Transaction,
} from '@solana/web3.js';
import {
  createBurnCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { SMELT_MINT } from '@/lib/constants';
import { PageShell } from '@/components/PageShell';
import { PageHeading } from '@/components/PageHeading';
import type { PlotResponse } from '@/app/api/foundry/route';

const SMELT_CLAIM_COST = 5_000;
const TOTAL_PLOTS = 500;
const SMELT_DECIMALS = 9;

function plotIcon(plot: PlotResponse, myWallet: string): string {
  if (!plot.owner) return '';
  if (plot.owner === myWallet) return '🏆';
  if (plot.accounts >= 100) return '💎';
  if (plot.accounts >= 50)  return '🏭';
  if (plot.accounts >= 25)  return '⚒️';
  return '🔥';
}

interface FoundryData {
  totalPlots: number;
  claimedCount: number;
  plots: PlotResponse[];
}

export default function FoundryPage() {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [data, setData]           = useState<FoundryData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<PlotResponse | null>(null);
  const [showClaim, setShowClaim] = useState(false);
  const [claiming, setClaiming]   = useState(false);
  const [claimError, setClaimError] = useState('');
  const [claimSuccess, setClaimSuccess] = useState<{ plotId: number; inscription: string } | null>(null);

  const userWallet = publicKey?.toBase58() ?? '';

  const fetchPlots = useCallback(async () => {
    try {
      const res = await fetch('/api/foundry', { cache: 'no-store' });
      if (res.ok) setData(await res.json() as FoundryData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlots(); }, [fetchPlots]);

  const myPlot = data?.plots.find(p => p.owner === userWallet) ?? null;
  const canClaim = connected && !myPlot && !loading;

  const nextPlotId = data
    ? (data.plots.find(p => p.owner === null)?.id ?? null)
    : null;

  async function handleClaim() {
    if (!publicKey || !signTransaction) return;
    setClaiming(true);
    setClaimError('');
    try {
      const userATA = await getAssociatedTokenAddress(
        SMELT_MINT,
        publicKey,
        false,
        TOKEN_PROGRAM_ID,
      );
      const burnAmount = BigInt(SMELT_CLAIM_COST) * BigInt(10 ** SMELT_DECIMALS);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      tx.add(
        createBurnCheckedInstruction(
          userATA,
          SMELT_MINT,
          publicKey,
          burnAmount,
          SMELT_DECIMALS,
          [],
          TOKEN_PROGRAM_ID,
        )
      );

      const signed = await signTransaction(tx);
      const txSig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed');

      const res = await fetch('/api/foundry/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: userWallet, txSignature: txSig }),
      });
      const json = await res.json() as { plotId?: number; inscription?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Claim failed');

      setClaimSuccess({ plotId: json.plotId!, inscription: json.inscription! });
      setShowClaim(false);
      await fetchPlots();
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <PageShell className="space-y-6">
      <PageHeading
        title="The Foundry"
        subtitle="500 forge stations. Smelt junk tokens into SMELT. Own a forge, earn 1.25× forever."
      />

      {/* Stats strip */}
      {!loading && data && (
        <div className="flex gap-6 text-sm">
          <span className="text-gray-500"><span className="font-bold text-gray-900">{data.claimedCount}</span> forges claimed</span>
          <span className="text-gray-500"><span className="font-bold text-amber-600">{TOTAL_PLOTS - data.claimedCount}</span> remaining</span>
        </div>
      )}

      {/* My forge banner */}
      {myPlot && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4">
          <div className="text-amber-800 font-bold text-sm mb-1">🏆 Your Forge #{myPlot.id} — 1.25× SMELT boost active</div>
          <div className="text-amber-700 text-xs leading-relaxed">{myPlot.inscription}</div>
        </div>
      )}

      {/* Claim success banner */}
      {claimSuccess && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4">
          <div className="text-green-800 font-bold text-sm mb-1">⚒ Forge #{claimSuccess.plotId} claimed! 1.25× boost is now active.</div>
          <div className="text-green-700 text-xs">{claimSuccess.inscription}</div>
        </div>
      )}

      {/* Claim button for eligible wallets without a plot */}
      {canClaim && !claimSuccess && (
        <button
          onClick={() => setShowClaim(true)}
          className="flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-2.5 text-sm transition-colors"
        >
          ⚒ Claim a Forge — 5,000 SMELT
        </button>
      )}

      {!connected && (
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <WalletMultiButton className="!bg-green-600 !text-white !font-bold !rounded-xl !px-4 !py-2 !h-auto !text-sm" />
          <span>Connect to claim a forge</span>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="h-64 rounded-2xl bg-gray-100 animate-pulse" />
      ) : (
        <div
          className="rounded-2xl border border-gray-100 bg-[#0c0a06] p-4 overflow-auto"
          style={{ maxHeight: '60vh' }}
        >
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', minWidth: '400px' }}
          >
            {data?.plots.map(plot => {
              const owned = !!plot.owner;
              const isMe = plot.owner === userWallet;
              return (
                <button
                  key={plot.id}
                  onClick={() => owned ? setSelected(plot) : undefined}
                  title={owned ? plot.inscription ?? undefined : `Plot #${plot.id} — unclaimed`}
                  className={[
                    'aspect-square flex items-center justify-center text-[11px] rounded transition-all',
                    owned
                      ? isMe
                        ? 'bg-[#1c1410] border-2 border-amber-400 shadow-[0_0_6px_#fbbf2444] cursor-pointer hover:border-amber-300'
                        : 'bg-[#1c1410] border border-[#78350f] cursor-pointer hover:border-amber-600'
                      : 'bg-[#0f0c08] border border-dashed border-[#3d2b10] cursor-default',
                  ].join(' ')}
                >
                  {owned ? plotIcon(plot, userWallet) : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">Click any claimed plot to see the owner&apos;s forge details.</p>

      {/* Plot popup */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#0f0c08] border-2 border-amber-400 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-amber-400 font-bold text-lg mb-1">Forge #{selected.id}</div>
            <div className="text-amber-200 text-xs font-mono mb-3">{selected.owner}</div>
            <div className="text-amber-100 text-sm leading-relaxed italic mb-4">{selected.inscription}</div>
            <div className="flex gap-4 text-xs text-amber-300">
              <span>{selected.accounts.toLocaleString()} accounts smelted</span>
              <span>{selected.smeltEarned.toLocaleString()} SMELT</span>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="mt-4 w-full rounded-xl border border-amber-800 text-amber-400 text-sm py-2 hover:border-amber-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Claim modal */}
      {showClaim && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => !claiming && setShowClaim(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-gray-900 font-extrabold text-xl mb-1">⚒ Claim a Forge</div>
            {nextPlotId && (
              <div className="text-gray-500 text-sm mb-4">You will be assigned Forge #{nextPlotId}.</div>
            )}
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4">
              <div className="text-amber-800 font-semibold text-sm">Cost: 5,000 SMELT</div>
              <div className="text-amber-600 text-xs mt-0.5">Burned permanently. You receive a permanent 1.25× SMELT boost.</div>
            </div>
            <div className="text-xs text-gray-400 mb-4">
              Requirements: 10+ accounts recycled &amp; enough SMELT in your wallet.
            </div>
            {claimError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 mb-4">
                {claimError}
              </div>
            )}
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-semibold rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {claiming && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {claiming ? 'Burning SMELT…' : 'Confirm — Burn 5,000 SMELT'}
            </button>
            <button
              onClick={() => setShowClaim(false)}
              disabled={claiming}
              className="mt-2 w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
