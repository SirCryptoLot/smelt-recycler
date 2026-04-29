// app/api/foundry/cancel-build/route.ts
//
// Cancels the active building upgrade and refunds the full ingot cost.
// Full refund is intentional — accidental clicks shouldn't cost the player.

import { NextResponse } from 'next/server';
import { getPlots } from '@/lib/foundry';
import { getForgeBuildings, saveForgeBuildings, buildCost } from '@/lib/foundry-buildings';
import { getWalletStats } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json() as { forgeId?: number; wallet?: string };
    const { forgeId, wallet } = body;

    if (!forgeId || !wallet) {
      return NextResponse.json({ error: 'Missing forgeId or wallet' }, { status: 400 });
    }

    const plots = getPlots();
    const plot = plots.find(p => p.id === forgeId);
    if (!plot) return NextResponse.json({ error: 'Forge not found' }, { status: 404 });
    if (plot.owner !== wallet) return NextResponse.json({ error: 'Not your forge' }, { status: 403 });

    const stats = getWalletStats(wallet);
    const fb = getForgeBuildings(forgeId, stats.allTime.smeltEarned);

    if (!fb.construction) {
      return NextResponse.json({ error: 'No construction in progress' }, { status: 400 });
    }

    const { buildingType, toLevel } = fb.construction;
    const refund = buildCost(buildingType, toLevel);

    fb.ingotBalance += refund;
    fb.construction = null;
    saveForgeBuildings(fb);

    return NextResponse.json({
      success: true,
      refunded: refund,
      buildingType,
      ingotBalance: fb.ingotBalance,
    });
  } catch (err) {
    console.error('[foundry/cancel-build]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
