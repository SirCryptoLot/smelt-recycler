// app/api/smelt-price/route.ts
import { NextResponse } from 'next/server';

const SMELT_MINT   = 'SME88JJYc8NrRvLVwWUgqk3kLuhuUwqu2JKDFeHdXb8';
const RAYDIUM_POOL = '2maqTUbPGA8eUodVi8gcqAG3rUP1V2uqKa5a5PB87X32';

export const dynamic = 'force-dynamic';

export async function GET() {
  let price: number | null = null;
  let marketCap: number | null = null;

  // Source 1: GeckoTerminal — indexes Raydium CPMM pools well, no API key needed
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${RAYDIUM_POOL}`,
      { headers: { Accept: 'application/json' } },
    );
    if (res.ok) {
      const json = await res.json() as {
        data?: { attributes?: { base_token_price_usd?: string; fdv_usd?: string; market_cap_usd?: string } }
      };
      const attr = json.data?.attributes;
      const p  = parseFloat(attr?.base_token_price_usd ?? '');
      const mc = parseFloat(attr?.market_cap_usd ?? attr?.fdv_usd ?? '');
      if (p  > 0) price = p;
      if (mc > 0) marketCap = mc;
    }
  } catch { /* fall through */ }

  // Source 2: Raydium API v3 — direct from the DEX itself
  if (!price) {
    try {
      const res = await fetch(
        `https://api-v3.raydium.io/pools/info/ids?ids=${RAYDIUM_POOL}`,
      );
      if (res.ok) {
        const json = await res.json() as {
          success?: boolean;
          data?: { price?: number; tvl?: number }[]
        };
        const pool = json.data?.[0];
        if (pool?.price && pool.price > 0) price = pool.price;
      }
    } catch { /* fall through */ }
  }

  // Source 3: Jupiter Price API v2
  if (!price) {
    try {
      const res = await fetch(`https://api.jup.ag/price/v2?ids=${SMELT_MINT}`);
      if (res.ok) {
        const json = await res.json() as { data: Record<string, { price: string } | null> };
        const p = parseFloat(json.data[SMELT_MINT]?.price ?? '');
        if (p > 0) price = p;
      }
    } catch { /* fall through */ }
  }

  return NextResponse.json({ price, marketCap });
}
