// app/swap/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { getSmeltPrice } from '@/lib/jupiter-swap';
import { SMELT_MINT } from '@/lib/constants';

const RAYDIUM_POOL_ID = '2maqTUbPGA8eUodVi8gcqAG3rUP1V2uqKa5a5PB87X32';

declare global {
  interface Window {
    Jupiter?: {
      init: (config: Record<string, unknown>) => void;
    };
  }
}

export default function SwapPage() {
  const [smeltPrice, setSmeltPrice] = useState<number | null>(null);
  const [jupiterLoaded, setJupiterLoaded] = useState(false);
  const jupiterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSmeltPrice().then(setSmeltPrice).catch(() => {});
  }, []);

  useEffect(() => {
    if (jupiterLoaded) return;
    const script = document.createElement('script');
    script.src = 'https://terminal.jup.ag/main-v4.js';
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
  }, [jupiterLoaded]);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 space-y-4">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Buy SMELT</h1>
            <p className="text-gray-400 text-sm mt-1">Swap any token for SMELT via Jupiter.</p>
          </div>
          <a
            href={`https://raydium.io/liquidity/increase/?mode=add&pool_id=${RAYDIUM_POOL_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-green-600 transition-colors mt-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Raydium pool
          </a>
        </div>

        {smeltPrice !== null && (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm px-5 py-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Market price</div>
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

        <div className="rounded-2xl border border-gray-100 overflow-hidden min-h-[420px] bg-white shadow-sm">
          <div id="jupiter-terminal" ref={jupiterRef} className="w-full min-h-[420px]" />
          {!jupiterLoaded && (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              Loading Jupiter…
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
