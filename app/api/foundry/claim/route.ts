// app/api/foundry/claim/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getPlotByOwner,
  getNextPlotId,
  buildInscription,
  recordPlot,
  getPlots,
  TOTAL_PLOTS,
  SMELT_CLAIM_COST,
  MIN_ACCOUNTS_TO_CLAIM,
} from '@/lib/foundry';
import { getWalletStats } from '@/lib/leaderboard';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { wallet, txSignature } = await req.json() as {
      wallet: string;
      txSignature: string;
    };

    if (!wallet || !txSignature) {
      return NextResponse.json({ error: 'wallet and txSignature required' }, { status: 400 });
    }

    // 1. Check recycling eligibility
    const stats = getWalletStats(wallet);
    if (stats.allTime.accounts < MIN_ACCOUNTS_TO_CLAIM) {
      return NextResponse.json(
        { error: `Must have recycled at least ${MIN_ACCOUNTS_TO_CLAIM} accounts. You have ${stats.allTime.accounts}.` },
        { status: 403 }
      );
    }

    // 2. Check not already an owner
    const existing = getPlotByOwner(wallet);
    if (existing) {
      return NextResponse.json(
        { error: `Wallet already owns Forge #${existing.id}` },
        { status: 409 }
      );
    }

    // 3. Check plots remain
    const claimed = getPlots().length;
    if (claimed >= TOTAL_PLOTS) {
      return NextResponse.json({ error: 'All 500 forges have been claimed' }, { status: 410 });
    }

    // 4. Assign next plot
    const plotId = getNextPlotId();
    if (plotId === null) {
      return NextResponse.json({ error: 'No plots available' }, { status: 410 });
    }

    // 5. Build inscription from current stats
    const inscription = buildInscription(
      plotId,
      wallet,
      stats.allTime.accounts,
      stats.allTime.smeltEarned,
    );

    // 6. Record
    recordPlot({
      id: plotId,
      owner: wallet,
      claimedAt: new Date().toISOString(),
      smeltBurned: SMELT_CLAIM_COST,
      inscription,
    });

    return NextResponse.json({ plotId, inscription });
  } catch (err) {
    console.error('Foundry claim failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    );
  }
}
