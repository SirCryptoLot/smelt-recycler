// app/api/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { getWalletStats, getWeeklyRank } from '../../../lib/leaderboard';
import { getReferralStats } from '../../../lib/referrals';

interface DistributionEntry {
  date: string;
  totalSol: number;
  recipientCount: number;
  txSignatures: string[];
}

const DISTRIBUTIONS_PATH = path.join(process.cwd(), 'data/distributions.json');

function loadDistributions(): DistributionEntry[] {
  try {
    if (!fs.existsSync(DISTRIBUTIONS_PATH)) return [];
    return JSON.parse(fs.readFileSync(DISTRIBUTIONS_PATH, 'utf-8')) as DistributionEntry[];
  } catch { return []; }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet param required' }, { status: 400 });

  const stats = getWalletStats(wallet);
  const rank = getWeeklyRank(wallet);
  const referral = getReferralStats(wallet);
  const distributions = loadDistributions();

  const lastDist = [...distributions].reverse().find(Boolean) ?? null;
  let nextDistributionDate: string | null = null;
  if (lastDist) {
    const d = new Date(lastDist.date);
    d.setDate(d.getDate() + 7);
    nextDistributionDate = d.toISOString();
  }

  return NextResponse.json({
    activity: {
      weeklyAccounts: stats.weekly.accounts,
      weeklyRank: rank,
      allTimeAccounts: stats.allTime.accounts,
      allTimeSolReclaimed: stats.allTime.solReclaimed,
      allTimeSmeltEarned: stats.allTime.smeltEarned,
    },
    referral: {
      link: '',
      referrals: referral.referrals.slice(-10).reverse(),
      pendingBonus: referral.pendingBonus,
      totalEarned: referral.totalEarned,
      count: referral.referrals.length,
    },
    distributions: {
      recent: distributions.slice(-5).reverse(),
      nextDistributionDate,
    },
  });
}
