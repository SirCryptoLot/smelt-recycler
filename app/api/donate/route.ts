export const dynamic = 'force-dynamic';
// app/api/donate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { loadDonations } from '@/lib/donations';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '@/lib/paths';

const DONATIONS_PATH = path.join(DATA_DIR, 'donations.json');

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { wallet, amount, txSignature } = await req.json() as {
      wallet: string;
      amount: number;
      txSignature: string;
    };
    if (!wallet || typeof amount !== 'number' || amount <= 0 || !txSignature) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }
    const donations = loadDonations();
    donations.push({
      date: new Date().toISOString(),
      wallet,
      solDonated: amount,
      pct: 0,
      txSignature,
      distributed: false,
    });
    fs.writeFileSync(DONATIONS_PATH, JSON.stringify(donations, null, 2));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to record donation' }, { status: 500 });
  }
}
