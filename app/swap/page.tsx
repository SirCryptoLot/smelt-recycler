// app/swap/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { getSmeltPrice } from '@/lib/jupiter-swap';
import { SMELT_MINT } from '@/lib/constants';

const RAYDIUM_POOL_ID = '2maqTUbPGA8eUodVi8gcqAG3rUP1V2uqKa5a5PB87X32';
const RAYDIUM_SWAP_URL = `https://raydium.io/swap/?inputMint=sol&outputMint=${SMELT_MINT.toBase58()}`;
const RAYDIUM_LP_URL = `https://raydium.io/liquidity/increase/?mode=add&pool_id=${RAYDIUM_POOL_ID}`;

function ExternalIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export default function SwapPage() {
  const [smeltPrice, setSmeltPrice] = useState<number | null>(null);

  useEffect(() => {
    getSmeltPrice().then(setSmeltPrice).catch(() => {});
  }, []);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-[480px] mx-auto px-4 py-8 space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Buy SMELT</h1>
          <p className="text-gray-400 text-sm mt-1">Trade SOL for SMELT on Raydium.</p>
        </div>

        {/* Price strip */}
        {smeltPrice !== null && (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm px-5 py-3.5 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">SMELT price</div>
              <div className="text-gray-900 font-bold tabular-nums">${smeltPrice.toFixed(8)}</div>
            </div>
            <a
              href={`https://solscan.io/token/${SMELT_MINT.toBase58()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-green-600 font-mono transition-colors"
            >
              {SMELT_MINT.toBase58().slice(0, 8)}…
            </a>
          </div>
        )}

        {/* Primary CTA — Raydium swap */}
        <a
          href={RAYDIUM_SWAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between w-full bg-green-600 hover:bg-green-500 active:scale-[0.98] transition-all text-white rounded-2xl px-6 py-5 group"
        >
          <div>
            <div className="font-bold text-lg leading-tight">Swap on Raydium</div>
            <div className="text-green-200 text-sm mt-0.5">SOL → SMELT · direct pool</div>
          </div>
          <ExternalIcon />
        </a>

        {/* Secondary links */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href={RAYDIUM_LP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between bg-white border border-gray-100 shadow-sm hover:border-green-200 hover:shadow-green-100/50 active:scale-[0.98] transition-all rounded-2xl px-4 py-4 group"
          >
            <div>
              <div className="font-semibold text-sm text-gray-800">Add Liquidity</div>
              <div className="text-gray-400 text-xs mt-0.5">Earn LP fees</div>
            </div>
            <ExternalIcon />
          </a>
          <a
            href={`https://solscan.io/token/${SMELT_MINT.toBase58()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between bg-white border border-gray-100 shadow-sm hover:border-green-200 hover:shadow-green-100/50 active:scale-[0.98] transition-all rounded-2xl px-4 py-4 group"
          >
            <div>
              <div className="font-semibold text-sm text-gray-800">Token Info</div>
              <div className="text-gray-400 text-xs mt-0.5">Solscan</div>
            </div>
            <ExternalIcon />
          </a>
        </div>

        {/* Pool info */}
        <div className="rounded-2xl border border-gray-100 bg-white/60 px-5 py-4 space-y-2 text-sm">
          <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">Pool details</div>
          <div className="flex justify-between text-gray-600">
            <span>DEX</span>
            <span className="font-semibold text-gray-800">Raydium CPMM</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Pair</span>
            <span className="font-semibold text-gray-800">SOL / SMELT</span>
          </div>
          <div className="flex justify-between text-gray-600 font-mono text-xs">
            <span>Pool ID</span>
            <span className="text-gray-500">{RAYDIUM_POOL_ID.slice(0, 8)}…{RAYDIUM_POOL_ID.slice(-6)}</span>
          </div>
        </div>

      </div>
    </main>
  );
}
