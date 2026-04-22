// app/api/smelt-price/route.ts
// Server-side proxy — avoids CORS and consolidates fallback logic.
import { NextResponse } from 'next/server';

const SMELT_MINT    = 'SME88JJYc8NrRvLVwWUgqk3kLuhuUwqu2JKDFeHdXb8';
const RAYDIUM_POOL  = '2maqTUbPGA8eUodVi8gcqAG3rUP1V2uqKa5a5PB87X32';

export const revalidate = 60; // cache 60 s on Railway

export async function GET() {
  let price: number | null = null;
  let marketCap: number | null = null;

  // Source 1: DexScreener pair endpoint (most reliable — direct pool lookup)
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/pairs/solana/${RAYDIUM_POOL}`,
      { next: { revalidate: 60 } },
    );
    if (res.ok) {
      const json = await res.json() as { pair?: { priceUsd?: string; fdv?: number; marketCap?: number } };
      const p = parseFloat(json.pair?.priceUsd ?? '');
      if (p > 0) price = p;
      const mc = json.pair?.marketCap ?? json.pair?.fdv ?? 0;
      if (mc > 0) marketCap = mc;
    }
  } catch { /* fall through */ }

  // Source 2: DexScreener token endpoint (catches any other pool)
  if (!price) {
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${SMELT_MINT}`,
        { next: { revalidate: 60 } },
      );
      if (res.ok) {
        const json = await res.json() as { pairs?: { priceUsd?: string; fdv?: number; marketCap?: number }[] };
        const pair = json.pairs?.[0];
        const p = parseFloat(pair?.priceUsd ?? '');
        if (p > 0) price = p;
        const mc = (pair?.marketCap ?? pair?.fdv) ?? 0;
        if (!marketCap && mc > 0) marketCap = mc;
      }
    } catch { /* fall through */ }
  }

  // Source 3: Jupiter Price API v2
  if (!price) {
    try {
      const res = await fetch(
        `https://api.jup.ag/price/v2?ids=${SMELT_MINT}`,
        { next: { revalidate: 60 } },
      );
      if (res.ok) {
        const json = await res.json() as { data: Record<string, { price: string } | null> };
        const p = parseFloat(json.data[SMELT_MINT]?.price ?? '');
        if (p > 0) price = p;
      }
    } catch { /* fall through */ }
  }

  return NextResponse.json({ price, marketCap });
}
