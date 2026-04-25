// app/api/foundry/leaderboard/route.ts
import { NextResponse } from 'next/server';
import { getPlots } from '@/lib/foundry';
import {
  loadLeagueData, computeWarScore, getOrCreateLeagueEntry,
  LeagueTier,
} from '@/lib/foundry-leagues';

export const dynamic = 'force-dynamic';

export interface LeaderboardRow {
  forgeId: number;
  wallet: string;
  inscription: string;
  league: LeagueTier;
  score: number;
  rank: number;
  consecutiveActiveSeasons: number;
}

export interface LeaderboardResponse {
  season: number;
  seasonStart: string;
  bronze: LeaderboardRow[];
  silver: LeaderboardRow[];
  gold:   LeaderboardRow[];
}

export async function GET(): Promise<NextResponse> {
  try {
    const plots = getPlots();
    const leagueData = loadLeagueData();

    // Compute score for every claimed forge
    const rows: Omit<LeaderboardRow, 'rank'>[] = [];

    for (const plot of plots) {
      if (!plot.owner) continue;
      const entry = getOrCreateLeagueEntry(plot.id, plot.owner);
      const score = computeWarScore(plot.id, plot.owner, leagueData.seasonStart);
      rows.push({
        forgeId: plot.id,
        wallet: plot.owner,
        inscription: plot.inscription,
        league: entry.league,
        score,
        consecutiveActiveSeasons: entry.consecutiveActiveSeasons,
      });
    }

    // Group and rank within each league (score desc)
    function rankLeague(tier: LeagueTier): LeaderboardRow[] {
      return rows
        .filter(r => r.league === tier)
        .sort((a, b) => b.score - a.score)
        .map((r, i) => ({ ...r, rank: i + 1 }));
    }

    const response: LeaderboardResponse = {
      season: leagueData.season,
      seasonStart: leagueData.seasonStart,
      bronze: rankLeague('bronze'),
      silver: rankLeague('silver'),
      gold:   rankLeague('gold'),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[foundry/leaderboard]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
