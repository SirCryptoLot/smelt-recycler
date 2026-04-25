// app/api/foundry/train/route.ts
import { NextResponse } from 'next/server';
import { getPlots } from '@/lib/foundry';
import { getForgeBuildings, saveForgeBuildings } from '@/lib/foundry-buildings';
import {
  getForgeTroops, saveForgeTroops, TROOP_META, ALL_TROOPS,
  TroopType, totalStationed, totalQueued, trainMinsPerTroop,
  BASE_TROOP_CAPACITY, CAPACITY_PER_BARRACKS,
} from '@/lib/foundry-troops';
import { getWalletStats } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json() as { forgeId?: number; troopType?: string; quantity?: number; wallet?: string };
    const { forgeId, troopType, quantity, wallet } = body;

    if (!forgeId || !troopType || !quantity || !wallet) {
      return NextResponse.json({ error: 'Missing forgeId, troopType, quantity, or wallet' }, { status: 400 });
    }
    if (!ALL_TROOPS.includes(troopType as TroopType)) {
      return NextResponse.json({ error: 'Invalid troop type' }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return NextResponse.json({ error: 'quantity must be 1–100' }, { status: 400 });
    }

    const plots = getPlots();
    const plot = plots.find(p => p.id === forgeId);
    if (!plot) return NextResponse.json({ error: 'Forge not found' }, { status: 404 });
    if (plot.owner !== wallet) return NextResponse.json({ error: 'Not your forge' }, { status: 403 });

    const stats = getWalletStats(wallet);
    const fb = getForgeBuildings(forgeId, stats.allTime.smeltEarned);
    const ft = getForgeTroops(forgeId);

    const barracksLevel = fb.levels['barracks'];
    if (barracksLevel < 1) {
      return NextResponse.json({ error: 'Build Barracks (Level 1) before training troops' }, { status: 400 });
    }

    const capacity = BASE_TROOP_CAPACITY + barracksLevel * CAPACITY_PER_BARRACKS;
    const currentTotal = totalStationed(ft) + totalQueued(ft);
    if (currentTotal + quantity > capacity) {
      return NextResponse.json({
        error: `Troop capacity exceeded — capacity ${capacity}, currently ${currentTotal}, requested ${quantity}`,
      }, { status: 400 });
    }

    const type = troopType as TroopType;
    const cost = TROOP_META[type].cost * quantity;
    if (fb.ingotBalance < cost) {
      return NextResponse.json({
        error: `Not enough Ingots — need ${cost.toLocaleString()}, have ${fb.ingotBalance.toLocaleString()}`,
      }, { status: 400 });
    }

    fb.ingotBalance -= cost;
    saveForgeBuildings(fb);

    const minsPerTroop = trainMinsPerTroop(type, barracksLevel);
    const totalMins = minsPerTroop * quantity;
    const lastItem = ft.trainingQueue[ft.trainingQueue.length - 1];
    const startTime = lastItem ? new Date(lastItem.completesAt) : new Date();
    const completesAt = new Date(startTime.getTime() + totalMins * 60_000).toISOString();

    ft.trainingQueue.push({ type, quantity, completesAt });
    saveForgeTroops(ft);

    return NextResponse.json({
      success: true,
      troopType: type,
      quantity,
      completesAt,
      ingotBalance: fb.ingotBalance,
      trainingQueue: ft.trainingQueue,
    });
  } catch (err) {
    console.error('[foundry/train]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
