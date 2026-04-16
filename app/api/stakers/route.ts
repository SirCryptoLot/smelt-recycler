export const dynamic = 'force-dynamic';
// app/api/stakers/route.ts
import { NextResponse } from 'next/server';
import { loadPool } from '@/lib/staking-pool';

export async function GET(): Promise<NextResponse> {
  try {
    const state = loadPool();
    const totalStaked = BigInt(state.totalSmeltStaked);

    const stakers = Object.entries(state.stakes)
      .filter(([, r]) => BigInt(r.smeltStaked) > 0n)
      .map(([wallet, r]) => {
        const raw = BigInt(r.smeltStaked);
        const stakedUi = Number(raw / 1_000_000_000n) + Number(raw % 1_000_000_000n) / 1e9;
        const sharePct = totalStaked > 0n ? (Number(raw) / Number(totalStaked)) * 100 : 0;
        return { wallet, stakedUi, sharePct };
      })
      .sort((a, b) => b.stakedUi - a.stakedUi)
      .slice(0, 10);

    return NextResponse.json(stakers);
  } catch {
    return NextResponse.json([]);
  }
}
