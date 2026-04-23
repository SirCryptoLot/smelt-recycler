// app/foundry/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction } from '@solana/web3.js';
import {
  createBurnCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { SMELT_MINT } from '@/lib/constants';
import type { PlotResponse } from '@/app/api/foundry/route';

const SMELT_CLAIM_COST = 5_000;
const TOTAL_PLOTS = 500;
const SMELT_DECIMALS = 9;

// ── Tile tier ─────────────────────────────────────────────────────────────────

type Tier = 'mine' | 'rare' | 'factory' | 'fire' | 'empty';

function getTier(plot: PlotResponse, myWallet: string): Tier {
  if (!plot.owner) return 'empty';
  if (plot.owner === myWallet) return 'mine';
  if (plot.accounts >= 100) return 'rare';
  if (plot.accounts >= 50)  return 'factory';
  return 'fire';
}

const TIER_ICON: Record<Tier, string> = {
  mine:    '🏆',
  rare:    '💎',
  factory: '🏭',
  fire:    '🔥',
  empty:   '',
};

// Warm pastel tile colours
const TILE_CLS: Record<Tier, string> = {
  mine:    'bg-amber-300 border-2 border-amber-500 shadow-sm',
  rare:    'bg-violet-200 border border-violet-400',
  factory: 'bg-sky-200   border border-sky-400',
  fire:    'bg-orange-200 border border-orange-300',
  empty:   'bg-stone-100  border border-dashed border-stone-300',
};

// ── Hero plot tile (bird's-eye CSS art) ───────────────────────────────────────

function HeroPlot({ tier }: { tier: Tier }) {
  const ground  = tier === 'empty' ? 'bg-stone-200' : 'bg-green-100';
  const buildBg = tier === 'mine'    ? 'bg-amber-400'
                : tier === 'rare'    ? 'bg-violet-300'
                : tier === 'factory' ? 'bg-sky-300'
                : tier === 'fire'    ? 'bg-orange-300'
                : 'bg-stone-300';
  const roofBg  = tier === 'empty' ? 'bg-stone-400' : 'bg-amber-900 opacity-70';
  const icon    = TIER_ICON[tier];

  return (
    <div
      className={`relative w-full aspect-square rounded-xl overflow-hidden border-2 ${
        tier === 'mine' ? 'border-amber-400' : 'border-stone-200'
      } ${ground}`}
    >
      {/* Ground grid lines */}
      <div className="absolute inset-0 opacity-20"
        style={{ backgroundImage: 'linear-gradient(#a8a29e 1px,transparent 1px),linear-gradient(90deg,#a8a29e 1px,transparent 1px)', backgroundSize: '25% 25%' }}
      />

      {/* Crates — top left */}
      <div className="absolute top-[8%] left-[6%] flex gap-[3%]">
        <div className="w-[14%] aspect-square bg-amber-700 rounded-sm border border-amber-900" style={{width:'14%'}} />
        <div className="w-[14%] aspect-square bg-amber-700 rounded-sm border border-amber-900" style={{width:'14%'}} />
      </div>
      <div className="absolute top-[22%] left-[6%]">
        <div className="bg-amber-700 rounded-sm border border-amber-900" style={{width:'14%',aspectRatio:'1'}} />
      </div>

      {/* Trees — top right */}
      <div className="absolute top-[6%] right-[8%] flex gap-1">
        <div className="rounded-full bg-green-500 border border-green-700" style={{width:'16%',aspectRatio:'1',minWidth:'10px'}} />
        <div className="rounded-full bg-green-600 border border-green-700" style={{width:'13%',aspectRatio:'1',minWidth:'8px'}} />
      </div>

      {/* Building footprint */}
      <div
        className={`absolute ${buildBg} rounded border-2 border-amber-800`}
        style={{ top: '28%', left: '22%', width: '52%', height: '42%' }}
      >
        {/* Roof (inner darker square) */}
        <div
          className={`absolute inset-[18%] ${roofBg} rounded-sm`}
        />
        {/* Chimney circles */}
        <div className="absolute rounded-full bg-stone-800 border border-stone-900"
          style={{ width: '20%', aspectRatio: '1', top: '15%', left: '25%' }}>
          {tier !== 'empty' && (
            <div className="absolute inset-[25%] rounded-full bg-orange-500 opacity-90" />
          )}
        </div>
        <div className="absolute rounded-full bg-stone-800 border border-stone-900"
          style={{ width: '16%', aspectRatio: '1', top: '18%', left: '55%' }}>
          {tier !== 'empty' && (
            <div className="absolute inset-[25%] rounded-full bg-orange-400 opacity-80" />
          )}
        </div>
        {/* Forge icon centred */}
        {tier !== 'empty' && (
          <div className="absolute inset-0 flex items-end justify-center pb-[8%] text-base sm:text-lg leading-none select-none">
            {icon}
          </div>
        )}
      </div>

      {/* Path from building down */}
      <div className="absolute bg-amber-200 opacity-60 rounded"
        style={{ top: '70%', left: '46%', width: '8%', height: '24%' }}
      />

      {/* "YOURS" label */}
      {tier === 'mine' && (
        <div className="absolute bottom-[4%] left-0 right-0 flex justify-center">
          <span className="bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">YOURS</span>
        </div>
      )}
      {tier === 'empty' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-stone-400 text-xs font-medium">No forge yet</span>
        </div>
      )}
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface FoundryData {
  totalPlots: number;
  claimedCount: number;
  plots: PlotResponse[];
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function FoundryPage() {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [data, setData]             = useState<FoundryData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<PlotResponse | null>(null);
  const [showClaim, setShowClaim]   = useState(false);
  const [claiming, setClaiming]     = useState(false);
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

  const myPlot   = data?.plots.find(p => p.owner === userWallet) ?? null;
  const canClaim = connected && !myPlot && !loading;
  const nextPlotId = data?.plots.find(p => p.owner === null)?.id ?? null;
  const myTier: Tier = myPlot ? getTier(myPlot, userWallet) : 'empty';

  async function handleClaim() {
    if (!publicKey || !signTransaction) return;
    setClaiming(true);
    setClaimError('');
    try {
      const userATA    = await getAssociatedTokenAddress(SMELT_MINT, publicKey, false, TOKEN_PROGRAM_ID);
      const burnAmount = BigInt(SMELT_CLAIM_COST) * BigInt(10 ** SMELT_DECIMALS);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      tx.add(createBurnCheckedInstruction(userATA, SMELT_MINT, publicKey, burnAmount, SMELT_DECIMALS, [], TOKEN_PROGRAM_ID));

      const signed = await signTransaction(tx);
      const txSig  = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed');

      const res  = await fetch('/api/foundry/claim', {
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
    /* Wide layout — bypass PageShell's 720px cap */
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 pt-6 sm:pt-8 pb-16">

      {/* ── Page heading ── */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">The Foundry</h1>
        <p className="text-gray-400 text-sm mt-1">500 forge plots · own one, earn 1.25× SMELT forever</p>
      </div>

      {/* ── Two-column layout ── */}
      <div className="flex flex-col sm:flex-row gap-5">

        {/* ── LEFT SIDEBAR ── */}
        <div className="flex-shrink-0 sm:w-52 space-y-4">

          {/* Hero plot tile */}
          <HeroPlot tier={myTier} />

          {/* Forge ID */}
          {myPlot && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-3 space-y-1.5">
              <div className="text-amber-800 font-bold text-sm">⚒ Forge #{myPlot.id}</div>
              <div className="text-[10px] text-amber-700 leading-relaxed">{myPlot.inscription}</div>
              <div className="flex gap-3 text-[10px] text-amber-600 pt-1">
                <span>{myPlot.accounts} accts</span>
                <span>{myPlot.smeltEarned.toLocaleString()} SMELT</span>
              </div>
              <div className="mt-1 inline-flex items-center gap-1 bg-orange-100 border border-orange-200 rounded-full px-2 py-0.5 text-[10px] font-bold text-orange-700">
                1.25× boost active
              </div>
            </div>
          )}

          {/* Claim success */}
          {claimSuccess && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-3 py-3">
              <div className="text-green-800 font-bold text-xs mb-1">Forge #{claimSuccess.plotId} claimed!</div>
              <div className="text-green-700 text-[10px]">{claimSuccess.inscription}</div>
            </div>
          )}

          {/* Stats */}
          {!loading && data && (
            <div className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-3 space-y-1.5 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Claimed</span>
                <span className="font-bold text-gray-800">{data.claimedCount} / {TOTAL_PLOTS}</span>
              </div>
              <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-amber-400 h-1.5 rounded-full transition-all"
                  style={{ width: `${(data.claimedCount / TOTAL_PLOTS) * 100}%` }}
                />
              </div>
              <div className="flex justify-between pt-0.5">
                <span>Remaining</span>
                <span className="font-bold text-amber-600">{TOTAL_PLOTS - data.claimedCount}</span>
              </div>
            </div>
          )}

          {/* CTA */}
          {canClaim && !claimSuccess && (
            <button
              onClick={() => setShowClaim(true)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl py-2.5 text-sm transition-colors"
            >
              ⚒ Claim a Forge
            </button>
          )}

          {!connected && (
            <div className="space-y-2">
              <WalletMultiButton className="!w-full !bg-green-600 !text-white !font-bold !rounded-xl !px-4 !py-2 !h-auto !text-sm !justify-center" />
              <p className="text-[10px] text-gray-400 text-center">Connect to claim a forge</p>
            </div>
          )}

          {/* Legend */}
          <div className="rounded-xl bg-white border border-stone-100 px-3 py-3 space-y-1.5 text-[10px] text-gray-500">
            {([
              ['bg-amber-300 border border-amber-500', '🏆 Your forge'],
              ['bg-orange-200 border border-orange-300', '🔥 Fire'],
              ['bg-sky-200 border border-sky-400', '🏭 Factory'],
              ['bg-violet-200 border border-violet-400', '💎 Rare'],
              ['bg-stone-100 border border-dashed border-stone-300', 'Available'],
            ] as const).map(([cls, label]) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded ${cls} flex-shrink-0`} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── MAP ── */}
        <div className="flex-1 min-w-0">
          <div
            className="rounded-2xl border border-stone-200 bg-amber-50 p-3 overflow-auto"
            style={{ maxHeight: '72vh' }}
          >
            {loading ? (
              <div className="h-64 flex items-center justify-center text-stone-400 text-sm">Loading map…</div>
            ) : (
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: 'repeat(20, minmax(0, 1fr))', minWidth: '360px' }}
              >
                {data?.plots.map(plot => {
                  const tier  = getTier(plot, userWallet);
                  const owned = tier !== 'empty';
                  return (
                    <button
                      key={plot.id}
                      onClick={() => owned ? setSelected(plot) : undefined}
                      title={owned ? `Forge #${plot.id} — ${plot.accounts} accounts` : `Plot #${plot.id} — unclaimed`}
                      className={[
                        'aspect-square flex items-center justify-center text-[10px] sm:text-xs rounded transition-all duration-100',
                        TILE_CLS[tier],
                        owned ? 'cursor-pointer hover:scale-110 hover:shadow' : 'cursor-default',
                        tier === 'mine' ? 'ring-2 ring-amber-400 ring-offset-1' : '',
                      ].join(' ')}
                    >
                      {TIER_ICON[tier]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-xs text-stone-400 mt-2 ml-1">Click any claimed plot to inspect · {data?.claimedCount ?? '…'} of 500 forges active</p>
        </div>
      </div>

      {/* ── Plot popup ── */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-stone-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{TIER_ICON[getTier(selected, userWallet)]}</span>
              <div>
                <div className="font-extrabold text-gray-900">Forge #{selected.id}</div>
                <div className="text-[10px] text-gray-400 font-mono">{selected.owner}</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800 italic leading-relaxed">
              {selected.inscription}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-gray-500">
              <span><span className="font-bold text-gray-800">{selected.accounts.toLocaleString()}</span> accounts smelted</span>
              <span><span className="font-bold text-green-700">{selected.smeltEarned.toLocaleString()}</span> SMELT earned</span>
            </div>
            <div className="mt-2 inline-flex items-center gap-1 bg-orange-50 border border-orange-100 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-orange-600">
              1.25× boost active
            </div>
            <button
              onClick={() => setSelected(null)}
              className="mt-4 w-full rounded-xl border border-stone-200 text-gray-500 text-sm py-2 hover:bg-stone-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Claim modal ── */}
      {showClaim && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !claiming && setShowClaim(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-stone-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-2xl mb-1">⚒</div>
            <div className="font-extrabold text-gray-900 text-xl mb-0.5">Claim a Forge</div>
            {nextPlotId && (
              <div className="text-gray-400 text-sm mb-4">You&apos;ll receive Forge #{nextPlotId}.</div>
            )}

            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4 space-y-1">
              <div className="text-amber-800 font-semibold text-sm">Cost: 5,000 SMELT</div>
              <div className="text-amber-600 text-xs">Burned permanently on-chain. You receive a permanent 1.25× SMELT multiplier on every recycle.</div>
            </div>

            {claimError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 mb-4">
                {claimError}
              </div>
            )}

            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {claiming && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {claiming ? 'Burning SMELT…' : 'Burn 5,000 SMELT · Claim Forge'}
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
    </div>
  );
}
