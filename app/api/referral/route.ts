// app/api/referral/route.ts
// Public endpoint — no auth.
// GET ?wallet=<pubkey>  → { code: "ABCDE" }   (creates code if first visit)
// GET ?code=<5chars>    → { wallet: "pubkey" } (404 if unknown)
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { getOrCreateCode, walletForCode } from '../../../lib/referrals';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wallet = req.nextUrl.searchParams.get('wallet');
  const code   = req.nextUrl.searchParams.get('code');

  if (wallet) {
    try { new PublicKey(wallet); } catch {
      return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 });
    }
    return NextResponse.json({ code: getOrCreateCode(wallet) });
  }

  if (code) {
    const resolved = walletForCode(code);
    if (!resolved) return NextResponse.json({ error: 'Code not found' }, { status: 404 });
    return NextResponse.json({ wallet: resolved });
  }

  return NextResponse.json({ error: 'wallet or code param required' }, { status: 400 });
}
