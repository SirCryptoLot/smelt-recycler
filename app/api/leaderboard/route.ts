export const dynamic = 'force-dynamic';
// app/api/leaderboard/route.ts
import { NextResponse } from 'next/server';
import { getLeaderboard } from '../../../lib/leaderboard';

function top20(entries: Record<string, { accounts: number; solReclaimed: number; smeltEarned: number }>) {
  return Object.entries(entries)
    .sort(([, a], [, b]) => b.accounts - a.accounts)
    .slice(0, 20)
    .map(([wallet, stats]) => ({ wallet, ...stats }));
}

export async function GET(): Promise<NextResponse> {
  const data = getLeaderboard();
  return NextResponse.json({
    weekly: {
      since: data.weekly.since,
      entries: top20(data.weekly.entries),
    },
    allTime: {
      entries: top20(data.allTime.entries),
    },
  });
}
