// app/api/admin/foundry/set-smelt/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getWalletStats } from '@/lib/leaderboard';
import { getForgeBuildings, saveForgeBuildings } from '@/lib/foundry-buildings';
import { getPlots } from '@/lib/foundry';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { wallet, amount } = await req.json() as { wallet?: string; amount?: number };
  if (!wallet || typeof amount !== 'number') {
    return NextResponse.json({ error: 'Missing wallet or amount' }, { status: 400 });
  }

  const plots = getPlots();
  const plot = plots.find(p => p.owner === wallet);
  if (!plot) {
    return NextResponse.json({ error: 'No forge found for this wallet' }, { status: 404 });
  }

  const stats = getWalletStats(wallet);
  const fb = getForgeBuildings(plot.id, stats.allTime.smeltEarned);
  fb.smeltBalance = amount;
  saveForgeBuildings(fb);

  return NextResponse.json({ success: true, forgeId: plot.id, smeltBalance: fb.smeltBalance });
}
