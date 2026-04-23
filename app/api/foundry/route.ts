// app/api/foundry/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getPlots, TOTAL_PLOTS } from '@/lib/foundry';
import { getWalletStats } from '@/lib/leaderboard';

export interface PlotResponse {
  id: number;
  owner: string | null;
  shortOwner: string | null;
  claimedAt: string | null;
  inscription: string | null;
  accounts: number;
  smeltEarned: number;
}

export async function GET(): Promise<NextResponse> {
  const plots = getPlots();

  // Build a map for O(1) lookup
  const byId = new Map(plots.map(p => [p.id, p]));

  const result: PlotResponse[] = [];

  for (let i = 1; i <= TOTAL_PLOTS; i++) {
    const plot = byId.get(i);
    if (!plot) {
      result.push({ id: i, owner: null, shortOwner: null, claimedAt: null, inscription: null, accounts: 0, smeltEarned: 0 });
      continue;
    }
    const stats = getWalletStats(plot.owner);
    result.push({
      id: i,
      owner: plot.owner,
      shortOwner: `${plot.owner.slice(0, 6)}…${plot.owner.slice(-4)}`,
      claimedAt: plot.claimedAt,
      inscription: plot.inscription,
      accounts: stats.allTime.accounts,
      smeltEarned: stats.allTime.smeltEarned,
    });
  }

  return NextResponse.json(
    {
      totalPlots: TOTAL_PLOTS,
      claimedCount: plots.length,
      plots: result,
    },
    {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' },
    }
  );
}
