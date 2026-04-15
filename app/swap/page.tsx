// app/swap/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { getSmeltPrice } from '@/lib/jupiter-swap';
import { SMELT_MINT } from '@/lib/constants';

declare global {
  interface Window {
    Jupiter?: {
      init: (config: Record<string, unknown>) => void;
    };
  }
}

export default function SwapPage() {
  const [smeltPrice, setSmeltPrice] = useState<number | null>(null);
  const [nav, setNav] = useState<number | null>(null);
  const [jupiterLoaded, setJupiterLoaded] = useState(false);
  const jupiterRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (jupiterLoaded) return;
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
  }, [jupiterLoaded]);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 space-y-4">

        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Buy SMELT</h1>
          <p className="text-gray-400 text-sm mt-1">Swap any token for SMELT via Jupiter.</p>
        </div>

        {(smeltPrice !== null || nav !== null) && (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm px-5 py-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Market price</div>
              <div className="text-gray-900 font-bold tabular-nums">{smeltPrice?.toFixed(8) ?? '—'} SOL</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Pending pool</div>
              <div className="text-indigo-500 font-bold tabular-nums">{nav?.toFixed(4) ?? '—'} SOL</div>
            </div>
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
