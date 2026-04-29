// app/api/foundry/forge/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPlots } from '@/lib/foundry';
import { getWalletStats } from '@/lib/leaderboard';
import { getForgeBuildings, BuildingType, ConstructionSlot } from '@/lib/foundry-buildings';
import { getForgeTroops, TroopCount, TrainingItem, BASE_TROOP_CAPACITY, CAPACITY_PER_BARRACKS } from '@/lib/foundry-troops';
import { getForgeAttacks, resolvePendingAttacks, AttackRecord } from '@/lib/foundry-combat';
import { loadLeagueData, computeWarScore, getOrCreateLeagueEntry, LeagueTier } from '@/lib/foundry-leagues';
import { getForgeItems, ForgeItems } from '@/lib/foundry-items';
import { getPlotPosition } from '@/lib/foundry-map';

export const dynamic = 'force-dynamic';

// Owner sees the full management view.
export interface ForgeStateResponse {
  isPublic: false;
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

// Non-owners see a "scout view" — enough for context and to attack, nothing more.
export interface ForgePublicResponse {
  isPublic: true;
  forgeId: number;
  owner: string;
  inscription: string;
  league: LeagueTier;
  warScore: number;
  position: { row: number; col: number } | null;
  // Surface signals only — no exact troop counts, building levels, or ingot balance.
  lastBattleAt: string | null;
  recentBattlesCount: number;
}

export type ForgeViewResponse = ForgeStateResponse | ForgePublicResponse;

export async function GET(
  req: NextRequest,
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

    // Resolve any of this forge's pending attacks before reading.
    resolvePendingAttacks([forgeId]);

    const leagueEntry = getOrCreateLeagueEntry(forgeId, plot.owner);
    const leagueData  = loadLeagueData();
    const warScore    = computeWarScore(forgeId, plot.owner, leagueData.seasonStart);

    const viewer = req.nextUrl.searchParams.get('wallet') ?? '';
    const isOwner = !!viewer && viewer === plot.owner;

    if (!isOwner) {
      // Public/scout view — no troops, no building tiers, no ingots.
      const allBattles = getForgeAttacks(forgeId)
        .filter(a => a.resolvedAt !== null)
        .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''));
      const lastBattleAt = allBattles[0]?.resolvedAt ?? null;
      const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentBattlesCount = allBattles.filter(
        a => a.resolvedAt && new Date(a.resolvedAt).getTime() >= recentCutoff,
      ).length;

      const response: ForgePublicResponse = {
        isPublic: true,
        forgeId,
        owner: plot.owner,
        inscription: plot.inscription,
        league: leagueEntry.league,
        warScore,
        position: getPlotPosition(forgeId),
        lastBattleAt,
        recentBattlesCount,
      };
      return NextResponse.json(response);
    }

    // Owner view — full state.
    const stats = getWalletStats(plot.owner);
    const seedSmelt = stats.allTime.smeltEarned;

    const buildings = getForgeBuildings(forgeId, seedSmelt);
    const troops = getForgeTroops(forgeId);
    const barracksLevel = buildings.levels['barracks'];
    const troopCapacity = BASE_TROOP_CAPACITY + barracksLevel * CAPACITY_PER_BARRACKS;

    const pendingAttacks = getForgeAttacks(forgeId).filter(
      a => a.resolvedAt === null && a.attackerForgeId === forgeId,
    );

    const items = getForgeItems(forgeId);

    const response: ForgeStateResponse = {
      isPublic: false,
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
      league: leagueEntry.league,
      warScore,
      items,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[foundry/forge/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
