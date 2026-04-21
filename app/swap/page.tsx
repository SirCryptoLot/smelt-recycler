// app/swap/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { getSmeltPrice } from '@/lib/jupiter-swap';
import { SMELT_MINT } from '@/lib/constants';

const MINT         = SMELT_MINT.toBase58();
const RAYDIUM_POOL = '2maqTUbPGA8eUodVi8gcqAG3rUP1V2uqKa5a5PB87X32';

// ── Platform logo (favicon with letter fallback) ──────────────────────────────

function PlatformLogo({ src, letter, bg }: { src: string; letter: string; bg: string }) {
  const [err, setErr] = useState(false);
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden ${bg}`}>
      {!err ? (
        <img src={src} alt={letter} className="w-full h-full object-cover" onError={() => setErr(true)} />
      ) : (
        <span>{letter}</span>
      )}
    </div>
  );
}

function ExternalArrow() {
  return (
    <svg className="w-4 h-4 opacity-50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

// ── Swap venues ───────────────────────────────────────────────────────────────

const VENUES = [
  {
    name: 'Jupiter',
    sub: 'Best-price aggregator',
    logo: 'https://jup.ag/favicon.ico',
    letter: 'J',
    bg: 'bg-[#6c48c5]',
    href: `https://jup.ag/swap/SOL-${MINT}`,
    primary: true,
    tag: 'Recommended',
  },
  {
    name: 'Raydium',
    sub: 'Direct CPMM pool',
    logo: 'https://raydium.io/favicon.ico',
    letter: 'R',
    bg: 'bg-[#3d5afe]',
    href: `https://raydium.io/swap/?inputMint=sol&outputMint=${MINT}`,
    primary: false,
  },
];

const ANALYTICS = [
  { name: 'DexScreener',  sub: 'Charts & trades',   logo: 'https://dexscreener.com/favicon.ico',  letter: 'D', bg: 'bg-gray-900', href: `https://dexscreener.com/solana/${MINT}` },
  { name: 'Birdeye',      sub: 'Token analytics',    logo: 'https://birdeye.so/favicon.ico',        letter: 'B', bg: 'bg-[#1e60c8]', href: `https://birdeye.so/token/${MINT}?chain=solana` },
  { name: 'Solscan',      sub: 'Token explorer',     logo: 'https://solscan.io/favicon.ico',        letter: 'S', bg: 'bg-[#1a6fef]', href: `https://solscan.io/token/${MINT}` },
  { name: 'Add Liquidity', sub: 'Earn LP fees',       logo: 'https://raydium.io/favicon.ico',       letter: 'LP', bg: 'bg-[#3d5afe]', href: `https://raydium.io/liquidity/increase/?mode=add&pool_id=${RAYDIUM_POOL}` },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SwapPage() {
  const [smeltPrice, setSmeltPrice] = useState<number | null>(null);
  const [supply, setSupply]         = useState<number | null>(null);
  const [marketCap, setMarketCap]   = useState<number | null>(null);

  useEffect(() => {
    // Primary: DexScreener gives price + fdv (≈ market cap) in one call
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${MINT}`)
      .then(r => r.json() as Promise<{ pairs?: { priceUsd?: string; fdv?: number }[] }>)
      .then(d => {
        const pair = d.pairs?.[0];
        const price = parseFloat(pair?.priceUsd ?? '');
        if (price > 0) setSmeltPrice(price);
        if (pair?.fdv && pair.fdv > 0) setMarketCap(pair.fdv);
      })
      .catch(() => {});

    // Jupiter price as fallback (runs concurrently, only sets if DexScreener missed)
    getSmeltPrice().then(p => { if (p) setSmeltPrice(prev => prev ?? p); }).catch(() => {});

    // Supply via Solana RPC (independent)
    fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [MINT] }),
    })
      .then(r => r.json() as Promise<{ result?: { value?: { uiAmount?: number } } }>)
      .then(d => { if (d?.result?.value?.uiAmount) setSupply(d.result.value.uiAmount); })
      .catch(() => {});
  }, []);

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
          {[
            { label: 'Price',       value: smeltPrice != null ? `$${smeltPrice.toFixed(8)}` : '—' },
            { label: 'Circulating', value: supply != null ? supply.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' SMELT' : '—' },
            { label: 'Mkt Cap',     value: marketCap != null ? `$${marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—' },
          ].map(({ label, value }, i) => (
            <div key={label} className="flex items-center gap-4">
              {i > 0 && <div className="w-px h-7 bg-gray-100 hidden sm:block" />}
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">{label}</div>
                <div className="text-gray-900 font-bold tabular-nums text-sm">{value}</div>
              </div>
            </div>
          ))}
          <div className="ml-auto">
            <a href={`https://solscan.io/token/${MINT}`} target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs text-gray-300 hover:text-green-600 transition-colors">
              {MINT.slice(0, 8)}…
            </a>
          </div>
        </div>

        {/* Swap venues */}
        <div className="space-y-2.5">
          <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Where to swap</div>
          {VENUES.map(({ name, sub, logo, letter, bg, href, primary, tag }) => (
            <a
              key={name}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-4 rounded-2xl px-4 py-4 transition-all active:scale-[0.99] group ${
                primary
                  ? 'bg-gray-950 hover:bg-gray-800 text-white shadow-lg'
                  : 'bg-white border border-gray-100 shadow-sm hover:border-gray-200'
              }`}
            >
              <PlatformLogo src={logo} letter={letter} bg={bg} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-sm ${primary ? 'text-white' : 'text-gray-900'}`}>{name}</span>
                  {tag && (
                    <span className="text-[10px] font-bold bg-green-500 text-white px-2 py-0.5 rounded-full tracking-wide">{tag}</span>
                  )}
                </div>
                <div className={`text-xs mt-0.5 ${primary ? 'text-gray-400' : 'text-gray-400'}`}>{sub}</div>
              </div>
              <div className={`flex items-center gap-1.5 font-semibold text-sm ${primary ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'}`}>
                SOL → SMELT
                <ExternalArrow />
              </div>
            </a>
          ))}
        </div>

        {/* Analytics & tools grid */}
        <div className="space-y-2.5">
          <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Analytics & tools</div>
          <div className="grid grid-cols-2 gap-2.5">
            {ANALYTICS.map(({ name, sub, logo, letter, bg, href }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white shadow-sm hover:border-gray-200 px-3.5 py-3.5 transition-all active:scale-[0.98] group"
              >
                <PlatformLogo src={logo} letter={letter} bg={bg} />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-900 font-semibold text-sm leading-tight">{name}</div>
                  <div className="text-gray-400 text-[11px] mt-0.5">{sub}</div>
                </div>
                <ExternalArrow />
              </a>
            ))}
          </div>
        </div>

        {/* Pool details */}
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 space-y-0">
          <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">Pool details</div>
          <div className="flex items-center gap-3 mb-3">
            <PlatformLogo src="https://raydium.io/favicon.ico" letter="R" bg="bg-[#3d5afe]" />
            <div>
              <div className="text-gray-900 font-bold text-sm">Raydium CPMM</div>
              <div className="text-gray-400 text-xs">SOL / SMELT · Solana Mainnet</div>
            </div>
            <a
              href={`https://raydium.io/liquidity/increase/?mode=add&pool_id=${RAYDIUM_POOL}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-green-600 font-semibold hover:text-green-700 transition-colors whitespace-nowrap"
            >
              + Add LP
            </a>
          </div>
          {([
            ['Pool ID',  `${RAYDIUM_POOL.slice(0, 8)}…${RAYDIUM_POOL.slice(-6)}`,   true],
            ['Decimals', '9',                                                          false],
            ['Fee tier', '0.25%',                                                     false],
          ] as [string, string, boolean][]).map(([k, v, mono]) => (
            <div key={k} className="flex justify-between text-sm py-1.5 border-t border-gray-100 first:border-0">
              <span className="text-gray-500">{k}</span>
              <span className={`font-semibold text-gray-800 ${mono ? 'font-mono text-xs' : ''}`}>{v}</span>
            </div>
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

      </div>
    </main>
  );
}
