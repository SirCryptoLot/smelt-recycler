// app/api/foundry/reports/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getPlots } from '@/lib/foundry';
import { getForgeAttacks, resolvePendingAttacks, AttackRecord } from '@/lib/foundry-combat';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    if (!wallet) {
      return NextResponse.json({ error: 'wallet param required' }, { status: 400 });
    }

    const plots = getPlots();
    const myPlot = plots.find(p => p.owner === wallet);
    if (!myPlot) {
      return NextResponse.json({ reports: [] });
    }

    // Lazy-resolve any of this forge's pending attacks whose arrival time has passed.
    // Without external cron, this is what makes battle results actually appear.
    resolvePendingAttacks([myPlot.id]);

    const reports: AttackRecord[] = getForgeAttacks(myPlot.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);

    return NextResponse.json({ forgeId: myPlot.id, reports });
  } catch (err) {
    console.error('[foundry/reports]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
