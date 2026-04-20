// app/swap/page.tsx
'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { getSmeltPrice } from '@/lib/jupiter-swap';
import { SMELT_MINT } from '@/lib/constants';

declare global {
  interface Window {
    Jupiter?: { init: (config: Record<string, unknown>) => void };
  }
}

const MINT         = SMELT_MINT.toBase58();
const SOL_MINT     = 'So11111111111111111111111111111111111111112';
const RAYDIUM_POOL = '2maqTUbPGA8eUodVi8gcqAG3rUP1V2uqKa5a5PB87X32';

const LINKS = [
  { label: 'Swap on Raydium', sub: 'Direct pool',      href: `https://raydium.io/swap/?inputMint=sol&outputMint=${MINT}`,                    primary: true },
  { label: 'Add Liquidity',   sub: 'Earn LP fees',     href: `https://raydium.io/liquidity/increase/?mode=add&pool_id=${RAYDIUM_POOL}` },
  { label: 'DexScreener',    sub: 'Charts & volume',   href: `https://dexscreener.com/solana/${MINT}` },
  { label: 'Birdeye',        sub: 'Analytics',         href: `https://birdeye.so/token/${MINT}?chain=solana` },
  { label: 'Jupiter',        sub: 'Aggregator swap',   href: `https://jup.ag/swap/SOL-${MINT}` },
  { label: 'Solscan',        sub: 'Token explorer',    href: `https://solscan.io/token/${MINT}` },
];

function initJupiter() {
  if (typeof window === 'undefined' || !window.Jupiter) return;
  window.Jupiter.init({
    displayMode: 'integrated',
    integratedTargetId: 'jupiter-terminal',
    endpoint: 'https://api.mainnet-beta.solana.com',
    strictTokenList: false,
    defaultExplorer: 'Solscan',
    formProps: {
      initialInputMint: SOL_MINT,
      initialOutputMint: MINT,
      fixedOutputMint: true,
    },
  });
}

function ExternalIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export default function SwapPage() {
  const [smeltPrice, setSmeltPrice] = useState<number | null>(null);
  const [supply, setSupply]         = useState<number | null>(null);

  useEffect(() => {
    getSmeltPrice().then(setSmeltPrice).catch(() => {});

    // Token supply via Solana JSON-RPC (no extra deps)
    fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [MINT] }),
    })
      .then(r => r.json() as Promise<{ result?: { value?: { uiAmount?: number } } }>)
      .then(d => { if (d?.result?.value?.uiAmount) setSupply(d.result.value.uiAmount); })
      .catch(() => {});

    // Handle return navigation — script already loaded, onLoad won't re-fire
    if (window.Jupiter) initJupiter();
  }, []);

  const marketCap = smeltPrice != null && supply != null ? smeltPrice * supply : null;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-[520px] mx-auto px-4 py-8 space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Buy SMELT</h1>
          <p className="text-gray-400 text-sm mt-1">Swap SOL for SMELT — the Recycler reward token.</p>
        </div>

        {/* Market data strip */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm px-5 py-4 flex items-center gap-5 flex-wrap">
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Price</div>
            <div className="text-gray-900 font-bold tabular-nums text-sm">
              {smeltPrice != null ? `$${smeltPrice.toFixed(8)}` : '—'}
            </div>
          </div>
          <div className="w-px h-8 bg-gray-100 hidden sm:block" />
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Circulating</div>
            <div className="text-gray-900 font-bold tabular-nums text-sm">
              {supply != null ? supply.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
            </div>
          </div>
          <div className="w-px h-8 bg-gray-100 hidden sm:block" />
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Mkt Cap</div>
            <div className="text-gray-900 font-bold tabular-nums text-sm">
              {marketCap != null ? `$${marketCap.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
            </div>
          </div>
          <div className="ml-auto">
            <a
              href={`https://solscan.io/token/${MINT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-gray-400 hover:text-green-600 transition-colors"
            >
              {MINT.slice(0, 8)}…
            </a>
          </div>
        </div>

        {/* Jupiter Terminal */}
        <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
          <div id="jupiter-terminal" style={{ minHeight: 450 }} />
        </div>
        <Script
          src="https://terminal.jup.ag/main-v3.js"
          strategy="afterInteractive"
          onLoad={initJupiter}
        />

        {/* External links */}
        <div className="grid grid-cols-2 gap-3">
          {LINKS.map(({ label, sub, href, primary }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-between rounded-2xl px-4 py-4 transition-all active:scale-[0.98] group ${
                primary
                  ? 'bg-green-600 hover:bg-green-500 text-white shadow'
                  : 'bg-white border border-gray-100 shadow-sm hover:border-green-200'
              }`}
            >
              <div>
                <div className={`font-semibold text-sm ${primary ? 'text-white' : 'text-gray-800'}`}>{label}</div>
                <div className={`text-xs mt-0.5 ${primary ? 'text-green-200' : 'text-gray-400'}`}>{sub}</div>
              </div>
              <ExternalIcon />
            </a>
          ))}
        </div>

        {/* Earn for free callout */}
        <a
          href="/"
          className="flex items-center justify-between rounded-2xl bg-green-50 border border-green-100 px-5 py-4 group hover:border-green-200 transition-colors"
        >
          <div>
            <div className="font-semibold text-sm text-green-800">Earn SMELT for free</div>
            <div className="text-xs text-green-600 mt-0.5">Recycle dust accounts → get SMELT + reclaim SOL rent</div>
          </div>
          <span className="text-green-600 group-hover:translate-x-0.5 transition-transform text-lg">→</span>
        </a>

        {/* Pool details */}
        <div className="rounded-2xl border border-gray-100 bg-white/60 px-5 py-4 space-y-2.5 text-sm">
          <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">Pool details</div>
          {([
            ['DEX',      'Raydium CPMM',                                             false],
            ['Pair',     'SOL / SMELT',                                              false],
            ['Pool ID',  `${RAYDIUM_POOL.slice(0, 8)}…${RAYDIUM_POOL.slice(-6)}`,   true],
            ['Decimals', '9',                                                         false],
            ['Network',  'Solana Mainnet',                                           false],
          ] as [string, string, boolean][]).map(([k, v, mono]) => (
            <div key={k} className="flex justify-between text-gray-600">
              <span>{k}</span>
              <span className={`font-semibold text-gray-800 ${mono ? 'font-mono text-xs' : ''}`}>{v}</span>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}
