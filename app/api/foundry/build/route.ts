// app/api/foundry/build/route.ts
import { NextResponse } from 'next/server';
import { getPlots } from '@/lib/foundry';
import {
  getForgeBuildings, saveForgeBuildings, buildCost, BUILD_TIME_MINS,
  BuildingType, ALL_BUILDINGS,
} from '@/lib/foundry-buildings';
import { getWalletStats } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json() as { forgeId?: number; buildingType?: string; wallet?: string };
    const { forgeId, buildingType, wallet } = body;

    if (!forgeId || !buildingType || !wallet) {
      return NextResponse.json({ error: 'Missing forgeId, buildingType, or wallet' }, { status: 400 });
    }
    if (!ALL_BUILDINGS.includes(buildingType as BuildingType)) {
      return NextResponse.json({ error: 'Invalid building type' }, { status: 400 });
    }

    const plots = getPlots();
    const plot = plots.find(p => p.id === forgeId);
    if (!plot) {
      return NextResponse.json({ error: 'Forge not found' }, { status: 404 });
    }
    if (plot.owner !== wallet) {
      return NextResponse.json({ error: 'Not your forge' }, { status: 403 });
    }

    const type = buildingType as BuildingType;
    const stats = getWalletStats(wallet);
    const fb = getForgeBuildings(forgeId, stats.allTime.smeltEarned);

    const currentLevel = fb.levels[type];
    if (currentLevel >= 5) {
      return NextResponse.json({ error: 'Building already at max level (5)' }, { status: 400 });
    }
    if (fb.construction) {
      return NextResponse.json({ error: 'Another building is already under construction' }, { status: 400 });
    }

    const toLevel = currentLevel + 1;
    const cost = buildCost(type, toLevel);
    if (fb.smeltBalance < cost) {
      return NextResponse.json({
        error: `Not enough SMELT — need ${cost.toLocaleString()}, have ${fb.smeltBalance.toLocaleString()}`,
      }, { status: 400 });
    }

    fb.smeltBalance -= cost;

    const buildMins = BUILD_TIME_MINS[toLevel] ?? 0;
    if (buildMins === 0) {
      fb.levels[type] = toLevel;
      fb.construction = null;
    } else {
      const completesAt = new Date(Date.now() + buildMins * 60_000).toISOString();
      fb.construction = { buildingType: type, toLevel, completesAt };
    }

    saveForgeBuildings(fb);

    return NextResponse.json({
      success: true,
      buildingType: type,
      toLevel,
      instant: buildMins === 0,
      completesAt: fb.construction?.completesAt ?? null,
      smeltBalance: fb.smeltBalance,
    });
  } catch (err) {
    console.error('[foundry/build]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
