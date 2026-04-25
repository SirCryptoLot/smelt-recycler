// app/api/admin/foundry/process-season/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getPlots } from '@/lib/foundry';
import { getForgeBuildings, saveForgeBuildings } from '@/lib/foundry-buildings';
import {
  loadLeagueData, saveLeagueData, loadPrizePool, savePrizePool,
  computeWarScore, getOrCreateLeagueEntry,
  PRIZE_INGOTS, SeasonResult, SeasonRankRow, LeagueTier,
} from '@/lib/foundry-leagues';

export const dynamic = 'force-dynamic';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueData = loadLeagueData();
  const plots = getPlots();
  const pool = loadPrizePool();

  // ── 1. Compute scores ─────────────────────────────────────────────────────
  const scored: {
    forgeId: number;
    wallet: string;
    league: LeagueTier;
    score: number;
  }[] = [];

  for (const plot of plots) {
    if (!plot.owner) continue;
    const entry = getOrCreateLeagueEntry(plot.id, plot.owner);
    const score = computeWarScore(plot.id, plot.owner, leagueData.seasonStart);
    scored.push({ forgeId: plot.id, wallet: plot.owner, league: entry.league, score });
  }

  // ── 2. Rank within each league ────────────────────────────────────────────
  function rankTier(tier: LeagueTier): typeof scored {
    return scored
      .filter(r => r.league === tier)
      .sort((a, b) => b.score - a.score);
  }

  const bronze = rankTier('bronze');
  const silver = rankTier('silver');
  const gold   = rankTier('gold');

  // ── 3. Promotion / relegation ─────────────────────────────────────────────
  const promoted  = new Set<number>();
  const relegated = new Set<number>();

  // Bronze #1 → Silver
  if (bronze.length > 0) promoted.add(bronze[0].forgeId);

  // Silver #1 → Gold; bottom 2 → Bronze (shield protects once)
  if (silver.length > 0) promoted.add(silver[0].forgeId);
  for (const r of silver.slice(-2)) {
    if (promoted.has(r.forgeId)) continue; // top-1 silver already going up
    const entry = leagueData.entries[String(r.forgeId)];
    if (entry?.shieldActive) {
      entry.shieldActive = false;
    } else {
      relegated.add(r.forgeId);
    }
  }

  // Gold bottom 2 → Silver (shield protects once)
  for (const r of gold.slice(-2)) {
    if (promoted.has(r.forgeId)) continue; // top-1 gold already going up
    const entry = leagueData.entries[String(r.forgeId)];
    if (entry?.shieldActive) {
      entry.shieldActive = false;
    } else {
      relegated.add(r.forgeId);
    }
  }

  // ── 4. Credit prizes from pool ────────────────────────────────────────────
  function creditPrizes(tier: LeagueTier, ranked: typeof scored): void {
    const amounts = PRIZE_INGOTS[tier];
    for (let i = 0; i < Math.min(3, ranked.length); i++) {
      const amount = amounts[i];
      if (amount > pool.ingotBalance) continue;
      const buildings = getForgeBuildings(ranked[i].forgeId);
      buildings.ingotBalance += amount;
      saveForgeBuildings(buildings);
      pool.ingotBalance -= amount;
    }
  }

  creditPrizes('bronze', bronze);
  creditPrizes('silver', silver);
  creditPrizes('gold',   gold);
  savePrizePool(pool);

  // ── 5. Apply league changes + update streaks ──────────────────────────────
  for (const r of scored) {
    const entry = leagueData.entries[String(r.forgeId)];
    if (!entry) continue;

    const wasActive = r.score > 0;
    entry.consecutiveActiveSeasons = wasActive ? entry.consecutiveActiveSeasons + 1 : 0;

    if (promoted.has(r.forgeId)) {
      entry.league = r.league === 'bronze' ? 'silver' : 'gold';
    } else if (relegated.has(r.forgeId)) {
      entry.league = r.league === 'silver' ? 'bronze' : 'silver';
    }
  }

  // ── 6. Archive season result ──────────────────────────────────────────────
  function toRows(ranked: typeof scored): SeasonRankRow[] {
    return ranked.map((r, i) => ({
      forgeId: r.forgeId,
      wallet:  r.wallet,
      score:   r.score,
      rank:    i + 1,
      ...(promoted.has(r.forgeId)  ? { promoted:  true } : {}),
      ...(relegated.has(r.forgeId) ? { relegated: true } : {}),
    }));
  }

  const result: SeasonResult = {
    season:      leagueData.season,
    seasonStart: leagueData.seasonStart,
    seasonEnd:   new Date().toISOString(),
    bronze: toRows(bronze),
    silver: toRows(silver),
    gold:   toRows(gold),
  };
  leagueData.history.push(result);

  // ── 7. Advance season ─────────────────────────────────────────────────────
  leagueData.season += 1;
  const nextStart = new Date(leagueData.seasonStart);
  nextStart.setUTCDate(nextStart.getUTCDate() + 7);
  leagueData.seasonStart = nextStart.toISOString();

  saveLeagueData(leagueData);

  return NextResponse.json({
    success: true,
    season:    result.season,
    promotions: promoted.size,
    relegations: relegated.size,
    prizePoolRemaining: pool.ingotBalance,
  });
}
