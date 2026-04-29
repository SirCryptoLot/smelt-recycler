// app/api/foundry/cancel-train/route.ts
//
// Cancels a single training queue entry and refunds its full ingot cost.
// Identifies the item by its `completesAt` ISO timestamp (unique enough since
// items are appended sequentially with strictly-increasing completion times).

import { NextResponse } from 'next/server';
import { getPlots } from '@/lib/foundry';
import { getForgeBuildings, saveForgeBuildings } from '@/lib/foundry-buildings';
import { getForgeTroops, saveForgeTroops, TROOP_META, TroopType } from '@/lib/foundry-troops';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json() as { forgeId?: number; wallet?: string; completesAt?: string };
    const { forgeId, wallet, completesAt } = body;

    if (!forgeId || !wallet || !completesAt) {
      return NextResponse.json({ error: 'Missing forgeId, wallet, or completesAt' }, { status: 400 });
    }

    const plots = getPlots();
    const plot = plots.find(p => p.id === forgeId);
    if (!plot) return NextResponse.json({ error: 'Forge not found' }, { status: 404 });
    if (plot.owner !== wallet) return NextResponse.json({ error: 'Not your forge' }, { status: 403 });

    const ft = getForgeTroops(forgeId);
    const idx = ft.trainingQueue.findIndex(item => item.completesAt === completesAt);
    if (idx < 0) {
      return NextResponse.json({ error: 'Training entry not found (it may have already completed)' }, { status: 404 });
    }

    const item = ft.trainingQueue[idx];
    const refund = TROOP_META[item.type as TroopType].cost * item.quantity;

    ft.trainingQueue.splice(idx, 1);
    saveForgeTroops(ft);

    const fb = getForgeBuildings(forgeId);
    fb.ingotBalance += refund;
    saveForgeBuildings(fb);

    return NextResponse.json({
      success: true,
      refunded: refund,
      troopType: item.type,
      quantity: item.quantity,
      ingotBalance: fb.ingotBalance,
    });
  } catch (err) {
    console.error('[foundry/cancel-train]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
