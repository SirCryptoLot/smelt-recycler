// app/api/foundry/forge/[id]/route.ts
import { NextResponse } from 'next/server';
import { getPlots } from '@/lib/foundry';
import { getWalletStats } from '@/lib/leaderboard';
import { getForgeBuildings, BuildingType, ConstructionSlot } from '@/lib/foundry-buildings';
import { getForgeTroops, TroopCount, TrainingItem, BASE_TROOP_CAPACITY, CAPACITY_PER_BARRACKS } from '@/lib/foundry-troops';
import { getForgeAttacks, AttackRecord } from '@/lib/foundry-combat';
import { loadLeagueData, computeWarScore, getOrCreateLeagueEntry, LeagueTier } from '@/lib/foundry-leagues';
import { getForgeItems, ForgeItems } from '@/lib/foundry-items';

export const dynamic = 'force-dynamic';

export interface ForgeStateResponse {
  forgeId: number;
  owner: string;
  inscription: string;
  ingotBalance: number;
  buildings: Record<BuildingType, number>;
  construction: ConstructionSlot | null;
  troops: TroopCount;
  troopCapacity: number;
  trainingQueue: TrainingItem[];
  pendingAttacks: AttackRecord[];
  league: LeagueTier;
  warScore: number;
  items: ForgeItems;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const forgeId = parseInt(params.id, 10);
    if (isNaN(forgeId) || forgeId < 1 || forgeId > 500) {
      return NextResponse.json({ error: 'Invalid forge ID' }, { status: 400 });
    }

    const plots = getPlots();
    const plot = plots.find(p => p.id === forgeId);
    if (!plot) {
      return NextResponse.json({ error: 'Forge not yet claimed' }, { status: 404 });
    }

    const stats = getWalletStats(plot.owner);
    const seedSmelt = stats.allTime.smeltEarned;

    const buildings = getForgeBuildings(forgeId, seedSmelt);
    const troops = getForgeTroops(forgeId);
    const barracksLevel = buildings.levels['barracks'];
    const troopCapacity = BASE_TROOP_CAPACITY + barracksLevel * CAPACITY_PER_BARRACKS;

    const pendingAttacks = getForgeAttacks(forgeId).filter(
      a => a.resolvedAt === null && a.attackerForgeId === forgeId,
    );

    const leagueData  = loadLeagueData();
    const leagueEntry = getOrCreateLeagueEntry(forgeId, plot.owner);
    const warScore    = computeWarScore(forgeId, plot.owner, leagueData.seasonStart);

    const items = getForgeItems(forgeId);

    const response: ForgeStateResponse = {
      forgeId,
      owner: plot.owner,
      inscription: plot.inscription,
      ingotBalance: buildings.ingotBalance,
      buildings: buildings.levels,
      construction: buildings.construction,
      troops: troops.stationed,
      troopCapacity,
      trainingQueue: troops.trainingQueue,
      pendingAttacks,
      league:   leagueEntry.league,
      warScore,
      items,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[foundry/forge/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
