// app/api/foundry/myforge/route.ts
//
// Tiny lookup endpoint: given a wallet address, returns its forge ID (or null).
// Used by GameNav so the Forge tab knows whether to be enabled.

import { NextRequest, NextResponse } from 'next/server';
import { getPlots } from '@/lib/foundry';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet');
    if (!wallet) {
      return NextResponse.json({ forgeId: null });
    }
    const plot = getPlots().find(p => p.owner === wallet);
    return NextResponse.json({ forgeId: plot?.id ?? null });
  } catch (err) {
    console.error('[foundry/myforge]', err);
    return NextResponse.json({ forgeId: null }, { status: 200 });
  }
}
